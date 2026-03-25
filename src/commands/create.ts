import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { loadConfig, saveConfig } from '../lib/config';

export async function createCommand(): Promise<void> {
  p.intro(pc.cyan('AgentSync — Create Skill'));

  // First: choose the source backend
  const source = await p.select({
    message: 'Where would you like to get this skill from?',
    options: [
      { value: 'local', label: 'Local', hint: 'Create a new skill from scratch (default)' },
      { value: 'voltagents', label: 'VoltAgents', hint: 'Browse and download from the VoltAgent registry (requires internet)' },
    ],
    initialValue: 'local',
  });

  if (p.isCancel(source)) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  if (source === 'voltagents') {
    const { pullCommand } = await import('./pull');
    await pullCommand();
    return;
  }

  // ── Local skill creation ──────────────────────────────────────────────────
  const config = await loadConfig();

  const nameInput = await p.text({
    message: 'Skill name (slug):',
    placeholder: 'angular-developer',
    validate: (v) => {
      if (!v.trim()) return 'Name is required';
      if (!/^[a-z0-9-_]+$/.test(v.trim()))
        return 'Use lowercase letters, numbers, hyphens, or underscores';
    },
  });
  if (p.isCancel(nameInput)) { p.cancel('Cancelled'); process.exit(0); }
  const skillName = (nameInput as string).trim();

  const descInput = await p.text({
    message: 'Short description:',
    placeholder: 'Angular development best practices and guidelines',
  });
  if (p.isCancel(descInput)) { p.cancel('Cancelled'); process.exit(0); }
  const description = (descInput as string).trim() || skillName;

  // Create skill directory + starter template
  const skillDir = path.join(config.libraryPath, skillName);

  if (await fs.pathExists(skillDir)) {
    p.log.warn(`Skill "${skillName}" already exists in library at ${skillDir}`);
  } else {
    await fs.ensureDir(skillDir);
    const template = [
      `# ${skillName}`,
      '',
      description,
      '',
      '## Guidelines',
      '',
      '<!-- Add your skill guidelines here -->',
      '',
    ].join('\n');
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), template);
    p.log.success(`Skill created at ${pc.dim(skillDir)}`);
  }

  // Offer to assign to a profile
  if (config.profiles.length === 0) {
    p.outro(
      pc.green(`Skill "${skillName}" is ready! Run \`agentsync link --profile <name>\` to activate it.`)
    );
    return;
  }

  const assignToProfile = await p.confirm({
    message: 'Add this skill to a profile?',
    initialValue: true,
  });

  if (p.isCancel(assignToProfile) || !assignToProfile) {
    p.outro(
      pc.green(`Skill "${skillName}" is ready! Run \`agentsync link --profile <name>\` to activate it.`)
    );
    return;
  }

  const profileChoice = await p.select({
    message: 'Select a profile:',
    options: config.profiles.map((pr) => ({
      value: pr.name,
      label: pr.name,
      hint: pr.description,
    })),
  });

  if (p.isCancel(profileChoice)) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  const selectedProfileName = profileChoice as string;
  const profile = config.profiles.find((pr) => pr.name === selectedProfileName)!;

  if (!profile.skills.includes(skillName)) {
    profile.skills.push(skillName);
    await saveConfig(config);
    p.log.success(`Added "${skillName}" to profile "${selectedProfileName}"`);
  } else {
    p.log.info(`Skill "${skillName}" is already in profile "${selectedProfileName}"`);
  }

  // Offer to sync (link) the profile immediately
  const syncNow = await p.confirm({
    message: `Sync profile "${selectedProfileName}" to your agents now?`,
    initialValue: true,
  });

  if (!p.isCancel(syncNow) && syncNow) {
    const { linkCommand } = await import('./link');
    await linkCommand(selectedProfileName);
    return;
  }

  p.outro(
    pc.green(`Done! Run \`agentsync link --profile ${selectedProfileName}\` whenever you're ready to activate.`)
  );
}
