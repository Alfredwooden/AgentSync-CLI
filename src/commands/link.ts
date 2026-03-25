import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { loadConfig, saveConfig } from '../lib/config';
import { createSymlink } from '../lib/symlink';
import { searchableMultiselect } from '../lib/searchable-multiselect';

export async function linkCommand(profileName: string): Promise<void> {
  const cwd = process.cwd();
  const config = await loadConfig();

  p.intro(pc.cyan(`AgentSync — Link Profile: ${pc.bold(profileName)}`));

  const profile = config.profiles.find(pr => pr.name === profileName);
  if (!profile) {
    p.log.error(`Profile "${profileName}" not found.`);
    p.log.info(`Available profiles: ${config.profiles.map(pr => pc.bold(pr.name)).join(', ')}`);
    process.exit(1);
  }

  // If profile has no skills, interactively assign from library
  if (profile.skills.length === 0) {
    p.log.warn('No skills assigned to this profile.');

    let librarySkills: string[] = [];
    try {
      librarySkills = await fs.readdir(config.libraryPath);
    } catch { /* empty library */ }

    if (librarySkills.length === 0) {
      p.log.error('Library is empty. Run `agentsync pull` first.');
      process.exit(1);
    }

    const assign = await p.confirm({
      message: 'Assign skills from your library to this profile now?',
    });
    if (p.isCancel(assign) || !assign) {
      p.cancel('No skills to link');
      process.exit(0);
    }

    const selected = await searchableMultiselect({
      message: 'Select skills to add to this profile:',
      options: librarySkills.map(s => ({ value: s, label: s })),
    });
    if (selected === null) {
      p.cancel('Cancelled');
      process.exit(0);
    }

    profile.skills = selected;
    await saveConfig(config);
    p.log.success(`Saved ${profile.skills.length} skill(s) to profile "${profileName}"`);
  }

  const results = [];
  for (const target of profile.targets) {
    const targetDir = path.join(cwd, target.path);
    for (const skill of profile.skills) {
      const sourcePath = path.join(config.libraryPath, skill);
      const result = await createSymlink(sourcePath, targetDir, skill, target.agent);
      results.push(result);
    }
  }

  const created = results.filter(r => r.status === 'created');
  const exists = results.filter(r => r.status === 'exists');
  const errors = results.filter(r => r.status === 'error');

  if (created.length > 0) {
    p.note(
      created.map(r => `  ${pc.green('+')} [${r.agent}] ${r.skill}`).join('\n'),
      'Created symlinks'
    );
  }
  if (exists.length > 0) {
    p.note(
      exists.map(r => `  ${pc.yellow('~')} [${r.agent}] ${r.skill}`).join('\n'),
      'Already linked'
    );
  }
  if (errors.length > 0) {
    p.note(
      errors.map(r => `  ${pc.red('✗')} [${r.agent}] ${r.skill}: ${r.message}`).join('\n'),
      pc.red('Errors')
    );
  }

  p.outro(
    pc.green(`Linked ${created.length} new skill(s) across ${profile.targets.length} agent(s)`)
  );
}
