import fs from 'fs-extra';
import path from 'path';
import pc from 'picocolors';
import * as p from '@clack/prompts';

interface AgentEntry {
  agent: string;
  dir: string;
  marker: string;
}

const AGENTS: AgentEntry[] = [
  { agent: 'Claude Code (skills)', dir: '.claude/skills', marker: '.claude' },
  { agent: 'Claude Code (agents)', dir: '.claude/agents', marker: '.claude' },
  { agent: 'Cursor', dir: '.cursor/rules', marker: '.cursor' },
  { agent: 'Gemini CLI', dir: '.gemini/skills', marker: '.gemini' },
  { agent: 'Copilot (skills)', dir: '.github/skills', marker: '.github' },
  { agent: 'Copilot (agents)', dir: '.github/agents', marker: '.github' },
  { agent: 'Codex', dir: '.codex/skills', marker: '.codex' },
];

export async function initCommand(): Promise<void> {
  const cwd = process.cwd();

  p.intro(pc.cyan('AgentSync — Initialize Project'));

  const detectedDirs: string[] = [];
  for (const { dir, marker } of AGENTS) {
    if (await fs.pathExists(path.join(cwd, marker))) {
      detectedDirs.push(dir);
    }
  }

  if (detectedDirs.length > 0) {
    p.note(
      detectedDirs.map(d => `  ${pc.green('✓')} ${d}`).join('\n'),
      'Detected LLM tools'
    );
  }

  const selected = await p.multiselect({
    message: 'Select agent directories to initialize:',
    options: AGENTS.map(({ agent, dir }) => ({
      value: dir,
      label: `${agent} (${dir})`,
      hint: detectedDirs.includes(dir) ? 'detected' : undefined,
    })),
    initialValues: detectedDirs,
  });

  if (p.isCancel(selected)) {
    p.cancel('Cancelled');
    process.exit(0);
  }

  const created: string[] = [];
  for (const dir of selected as string[]) {
    const fullPath = path.join(cwd, dir);
    if (!await fs.pathExists(fullPath)) {
      await fs.ensureDir(fullPath);
      created.push(dir);
    }
  }

  if (created.length > 0) {
    p.note(created.map(d => `  ${pc.green('+')} ${d}`).join('\n'), 'Created directories');
  } else {
    p.log.info('All selected directories already exist.');
  }

  p.outro(
    pc.green('Project initialized!') +
    '\n  Offline: ' + pc.dim('agentsync create') + '  — build skills locally' +
    '\n  Online:  ' + pc.dim('agentsync pull') + '   — download from registry'
  );
}
