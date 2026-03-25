import path from 'path';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { loadConfig } from '../lib/config';
import { removeSymlink } from '../lib/symlink';

export async function unlinkCommand(profileName?: string): Promise<void> {
  const cwd = process.cwd();
  const config = await loadConfig();

  p.intro(pc.cyan('AgentSync — Unlink Skills'));

  const profiles = profileName
    ? config.profiles.filter(pr => pr.name === profileName)
    : config.profiles;

  if (profileName && profiles.length === 0) {
    p.log.error(`Profile "${profileName}" not found.`);
    p.log.info(`Available profiles: ${config.profiles.map(pr => pc.bold(pr.name)).join(', ')}`);
    process.exit(1);
  }

  const confirmMsg = profileName
    ? `Remove symlinks for profile "${pc.bold(profileName)}"?`
    : 'Remove ALL AgentSync symlinks from this project?';

  const confirm = await p.confirm({ message: confirmMsg, initialValue: false });
  if (p.isCancel(confirm) || !confirm) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  let removed = 0;
  const errors: string[] = [];

  for (const profile of profiles) {
    for (const target of profile.targets) {
      const targetDir = path.join(cwd, target.path);
      for (const skill of profile.skills) {
        const result = await removeSymlink(targetDir, skill);
        if (result.removed) {
          removed++;
        } else if (result.message && result.message !== 'Not found') {
          errors.push(`[${target.agent}] ${skill}: ${result.message}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    p.note(errors.map(e => `  ${pc.red('✗')} ${e}`).join('\n'), pc.red('Errors'));
  }

  p.outro(pc.green(`Removed ${removed} symlink(s)`));
}
