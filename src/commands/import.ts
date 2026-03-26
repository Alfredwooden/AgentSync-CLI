import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { loadConfig, saveConfig } from '../lib/config';
import { searchableMultiselect } from '../lib/searchable-multiselect';

/** Directories AgentSync looks in when no --dir is given. */
const DEFAULT_AGENT_SOURCES = [
  '.github/agents',
  '.claude/agents',
  '.cursor/rules',
];

interface AgentFile {
  name: string;
  fileName: string;
  fullPath: string;
  description: string;
  content: string;
}

/** Pull the description value out of YAML-ish frontmatter. */
function extractDescription(content: string): string {
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return '';
  const descMatch = fmMatch[1].match(/description:\s*["']?([^"'\n]+)["']?/);
  return descMatch ? descMatch[1].trim() : '';
}

/** Collect all agent-like markdown files from a directory. */
async function findAgentFiles(sourceDir: string): Promise<AgentFile[]> {
  if (!await fs.pathExists(sourceDir)) return [];

  let entries: string[];
  try {
    entries = await fs.readdir(sourceDir);
  } catch {
    return [];
  }

  const files: AgentFile[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.md') && !entry.endsWith('.mdc')) continue;

    const fullPath = path.join(sourceDir, entry);
    let stat: fs.Stats;
    try {
      stat = await fs.stat(fullPath);
    } catch { continue; }
    if (!stat.isFile()) continue;

    const content = await fs.readFile(fullPath, 'utf-8');

    // Only import files that have YAML frontmatter — plain docs are not agents
    if (!content.trimStart().startsWith('---')) continue;

    // Derive a slug from the filename (strip all agent/md/mdc suffixes)
    const name = entry.replace(/\.(agent\.md|mdc|md)$/, '');

    files.push({
      name,
      fileName: entry,
      fullPath,
      description: extractDescription(content),
      content,
    });
  }

  return files;
}

export async function importCommand(opts: { dir?: string }): Promise<void> {
  p.intro(pc.cyan('AgentSync — Import Agents'));

  const cwd = process.cwd();
  const config = await loadConfig();

  // ── Determine source directories ──────────────────────────────────────────
  let sourceDirs: string[];

  if (opts.dir) {
    sourceDirs = [path.resolve(cwd, opts.dir)];
  } else {
    sourceDirs = [];
    for (const d of DEFAULT_AGENT_SOURCES) {
      const full = path.join(cwd, d);
      if (await fs.pathExists(full)) sourceDirs.push(full);
    }

    if (sourceDirs.length === 0) {
      const dirInput = await p.text({
        message: 'No agent directories detected. Enter source directory:',
        placeholder: '.github/agents',
        validate: (v) => (!v.trim() ? 'Required' : undefined),
      });
      if (p.isCancel(dirInput)) { p.cancel('Cancelled'); process.exit(0); }
      sourceDirs = [path.resolve(cwd, (dirInput as string).trim())];
    } else {
      p.note(sourceDirs.map(d => `  ${pc.green('✓')} ${d}`).join('\n'), 'Detected agent directories');
    }
  }

  // ── Collect agent files ────────────────────────────────────────────────────
  const spinner = p.spinner();
  spinner.start('Scanning for agent files…');

  const agentFiles: AgentFile[] = [];
  for (const dir of sourceDirs) {
    const found = await findAgentFiles(dir);
    agentFiles.push(...found);
  }

  spinner.stop(
    agentFiles.length === 0
      ? pc.yellow('No agent files found')
      : `Found ${pc.bold(String(agentFiles.length))} agent file(s)`
  );

  if (agentFiles.length === 0) {
    p.outro(pc.yellow('Nothing to import.'));
    return;
  }

  // ── Show summary + pick which to import ────────────────────────────────────
  const summaryLines = agentFiles.map(f => {
    const desc = f.description ? pc.dim(` — ${f.description.slice(0, 55)}`) : '';
    const inLib = fs.pathExistsSync(path.join(config.libraryPath, f.name, 'agent.md'));
    const status = inLib ? pc.yellow('[exists]') : pc.green('[new]   ');
    return `  ${status} ${pc.bold(f.name)}${desc}`;
  });
  p.note(summaryLines.join('\n'), 'Agents found');

  const toImport = await searchableMultiselect({
    message: 'Select agents to import:',
    options: agentFiles.map(f => ({
      value: f.name,
      label: f.name,
      hint: f.description.slice(0, 60) || undefined,
    })),
    initialSelected: agentFiles.map(f => f.name),
  });

  if (toImport === null) { p.cancel('Cancelled'); process.exit(0); }
  if (toImport.length === 0) { p.outro(pc.yellow('Nothing selected.')); return; }

  // ── Write to library ────────────────────────────────────────────────────────
  const importSpinner = p.spinner();
  importSpinner.start('Importing agents into library…');

  const imported: string[] = [];
  const unchanged: string[] = [];

  for (const f of agentFiles.filter(af => toImport.includes(af.name))) {
    const destDir = path.join(config.libraryPath, f.name);
    const destFile = path.join(destDir, 'agent.md');

    if (await fs.pathExists(destFile)) {
      const existing = await fs.readFile(destFile, 'utf-8');
      if (existing === f.content) { unchanged.push(f.name); continue; }
    }

    await fs.ensureDir(destDir);
    await fs.writeFile(destFile, f.content, 'utf-8');
    imported.push(f.name);
  }

  importSpinner.stop(
    `Imported ${pc.green(String(imported.length))} agent(s)` +
    (unchanged.length > 0 ? pc.dim(` (${unchanged.length} unchanged)`) : '')
  );

  if (imported.length === 0) {
    p.outro(pc.green('Library is already up to date.'));
    return;
  }

  // ── Profile assignment ──────────────────────────────────────────────────────
  if (config.profiles.length === 0) {
    p.outro(pc.green(`Done! Run \`agentsync link --profile <name>\` to activate.`));
    return;
  }

  // Warn if no profile has an agent-type target configured
  const agentProfiles = config.profiles.filter(pr =>
    pr.targets.some(t => t.type === 'agent')
  );
  if (agentProfiles.length === 0) {
    p.log.warn(
      'None of your profiles have agent targets configured.\n' +
      pc.dim('  Add targets with `"type": "agent"` in ~/.ai-skills/config.json,\n') +
      pc.dim('  e.g. { "agent": "claude", "path": ".claude/agents", "type": "agent" }')
    );
  }

  const assignToProfile = await p.confirm({
    message: 'Add imported agents to a profile?',
    initialValue: true,
  });
  if (p.isCancel(assignToProfile) || !assignToProfile) {
    p.outro(pc.green(`Done! Run \`agentsync link --profile <name>\` to activate.`));
    return;
  }

  const profileChoice = await p.select({
    message: 'Select a profile:',
    options: config.profiles.map(pr => ({
      value: pr.name,
      label: pr.name,
      hint: pr.description + (pr.targets.some(t => t.type === 'agent') ? '' : pc.yellow(' ⚠ no agent targets')),
    })),
  });
  if (p.isCancel(profileChoice)) {
    p.outro(pc.green('Agents imported. Assign to a profile when ready.'));
    return;
  }

  const profile = config.profiles.find(pr => pr.name === (profileChoice as string))!;
  let addedCount = 0;
  for (const name of imported) {
    if (!profile.skills.includes(name)) {
      profile.skills.push(name);
      addedCount++;
    }
  }

  await saveConfig(config);
  p.log.success(`Added ${addedCount} agent(s) to profile "${profileChoice as string}"`);

  const linkNow = await p.confirm({
    message: `Link profile "${profileChoice as string}" now?`,
    initialValue: true,
  });

  if (!p.isCancel(linkNow) && linkNow) {
    const { linkCommand } = await import('./link');
    await linkCommand(profileChoice as string);
    return;
  }

  p.outro(pc.green(`Done! Run \`agentsync link --profile ${profileChoice as string}\` when ready.`));
}
