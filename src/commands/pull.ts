import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { loadConfig, saveConfig } from '../lib/config';
import { fetchSkillList, downloadSkill } from '../lib/github';
import { searchableMultiselect } from '../lib/searchable-multiselect';

export async function pullCommand(): Promise<void> {
  p.intro(pc.cyan('AgentSync — Pull Skills from VoltAgent'));

  const config = await loadConfig();

  // Resolve token: env var takes priority, then stored config, then prompt
  let token: string | undefined = process.env.GITHUB_TOKEN || config.githubToken;

  if (!token) {
    p.note(
      'A GitHub token avoids rate limits and allows downloading skills from private repos.',
      pc.yellow('Tip')
    );
    const input = await p.text({
      message: 'GitHub token (leave empty to skip):',
      placeholder: 'ghp_...',
    });
    if (p.isCancel(input)) {
      p.cancel('Cancelled');
      process.exit(0);
    }
    token = (input as string).trim() || undefined;
    if (token) {
      const save = await p.confirm({ message: 'Save token to AgentSync config for future use?' });
      if (!p.isCancel(save) && save) {
        config.githubToken = token;
        await saveConfig(config);
        p.log.success('Token saved.');
      }
    }
  }

  const spinner = p.spinner();
  spinner.start('Fetching skill list from VoltAgent/awesome-agent-skills...');

  let skills;
  try {
    skills = await fetchSkillList(token);
    spinner.stop(`Found ${skills.length} available skills`);
  } catch (err) {
    spinner.stop(pc.red('Failed to fetch skills'));
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  if (skills.length === 0) {
    p.log.warn('No skills found in the registry. The README format may have changed.');
    p.outro('Nothing to download.');
    return;
  }

  const selected = await searchableMultiselect({
    message: 'Select skills to download:',
    options: skills.map(s => {
      const localName = s.id.replace('/', '__');
      return {
        value: s.id,
        label: s.id,
        hint: fs.existsSync(path.join(config.libraryPath, localName)) ? 'installed' : s.description,
      };
    }),
  });

  if (selected === null) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  const selectedIds = new Set(selected);
  const toInstall = skills.filter(s => selectedIds.has(s.id));

  for (const skill of toInstall) {
    const localName = skill.id.replace('/', '__');
    const sp = p.spinner();
    sp.start(`Downloading ${skill.id}...`);
    try {
      await downloadSkill(skill, path.join(config.libraryPath, localName), token);
      sp.stop(`${pc.green('✓')} ${skill.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint = msg.includes('401') ? ' (private repo or invalid token)' : '';
      sp.stop(`${pc.red('✗')} ${skill.id}: ${msg}${pc.dim(hint)}`);
    }
  }

  p.outro(pc.green('Done! Run `agentsync link --profile <name>` to activate skills.'));
}
