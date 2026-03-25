import fs from 'fs-extra';
import path from 'path';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { loadConfig } from '../lib/config';
import { checkSymlink } from '../lib/symlink';

const AGENT_DIRS = [
  '.claude/skills',
  '.cursor/rules',
  '.gemini/skills',
  '.github/skills',
  '.codex/skills',
];

export async function doctorCommand(): Promise<void> {
  const cwd = process.cwd();
  const config = await loadConfig();

  p.intro(pc.cyan('AgentSync — Doctor'));

  const issues: string[] = [];
  const valid: string[] = [];

  // Check library exists
  if (!await fs.pathExists(config.libraryPath)) {
    issues.push(`Library directory missing: ${config.libraryPath}`);
  } else {
    const skills = await fs.readdir(config.libraryPath);
    for (const skill of skills) {
      const skillMd = path.join(config.libraryPath, skill, 'SKILL.md');
      if (!await fs.pathExists(skillMd)) {
        issues.push(`${pc.yellow('⚠')}  Skill missing SKILL.md: ${skill}`);
      }
    }
  }

  // Check symlinks in all agent dirs
  for (const agentDir of AGENT_DIRS) {
    const fullDir = path.join(cwd, agentDir);
    if (!await fs.pathExists(fullDir)) continue;

    const entries = await fs.readdir(fullDir);
    for (const entry of entries) {
      const entryPath = path.join(fullDir, entry);
      const status = await checkSymlink(entryPath);
      const label = path.join(agentDir, entry);

      if (status === 'broken') {
        issues.push(`${pc.red('✗')}  Broken symlink: ${label}`);
      } else if (status === 'valid') {
        valid.push(`${pc.green('✓')}  ${label}`);
      }
    }
  }

  // Check profile skills exist in library
  for (const profile of config.profiles) {
    for (const skill of profile.skills) {
      const skillPath = path.join(config.libraryPath, skill);
      if (!await fs.pathExists(skillPath)) {
        issues.push(
          `${pc.yellow('⚠')}  Profile "${profile.name}" references missing skill: ${skill}`
        );
      }
    }
  }

  if (valid.length > 0) {
    p.note(valid.join('\n'), `Valid symlinks (${valid.length})`);
  }

  if (issues.length === 0) {
    p.outro(pc.green('All checks passed!'));
  } else {
    p.note(issues.join('\n'), pc.red(`Issues (${issues.length})`));
    p.outro(pc.yellow(`Found ${issues.length} issue(s) — fix broken symlinks with \`agentsync unlink\` then \`agentsync link\``));
    process.exit(1);
  }
}
