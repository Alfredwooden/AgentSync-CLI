import path from 'path';
import fs from 'fs-extra';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { loadConfig, saveConfig } from '../lib/config';
import { createSymlink } from '../lib/symlink';

const DEFAULT_AGENT_DIRS = [
  '.claude/skills',
  '.cursor/rules',
  '.gemini/skills',
  '.github/skills',
  '.codex/skills',
];

interface UnmanagedEntry {
  /** Absolute path to the entry on disk */
  fullPath: string;
  /** Name of the skill dir/file */
  name: string;
  /** Relative dir it was found in, e.g. ".agents/skills" */
  agentDir: string;
  /** true = real dir/file; false = symlink not pointing to AgentSync library */
  isExternalSymlink: boolean;
  /** True when a skill with the same name already exists in the library */
  inLibrary: boolean;
}

async function collectUnmanaged(
  dirs: string[],
  cwd: string,
  libraryPath: string
): Promise<UnmanagedEntry[]> {
  const unmanaged: UnmanagedEntry[] = [];
  const librarySkills = await fs.pathExists(libraryPath)
    ? await fs.readdir(libraryPath)
    : [];

  for (const agentDir of dirs) {
    const fullDir = path.join(cwd, agentDir);
    if (!await fs.pathExists(fullDir)) continue;

    let entries: string[];
    try {
      entries = await fs.readdir(fullDir);
    } catch {
      continue;
    }

    for (const name of entries) {
      const fullPath = path.join(fullDir, name);
      let lstat: fs.Stats;
      try {
        lstat = await fs.lstat(fullPath);
      } catch {
        continue;
      }

      if (lstat.isSymbolicLink()) {
        const target = await fs.readlink(fullPath);
        // Resolve relative symlinks
        const resolvedTarget = path.isAbsolute(target)
          ? target
          : path.resolve(path.dirname(fullPath), target);

        if (resolvedTarget.startsWith(libraryPath)) {
          // Managed by AgentSync — skip
          continue;
        }
        // Symlink pointing elsewhere
        unmanaged.push({
          fullPath,
          name,
          agentDir,
          isExternalSymlink: true,
          inLibrary: librarySkills.includes(name),
        });
      } else {
        // Real directory or file — not a symlink at all
        unmanaged.push({
          fullPath,
          name,
          agentDir,
          isExternalSymlink: false,
          inLibrary: librarySkills.includes(name),
        });
      }
    }
  }

  return unmanaged;
}

export async function scanCommand(opts: { dir?: string[] }): Promise<void> {
  const cwd = process.cwd();
  p.intro(pc.cyan('AgentSync — Scan for Unmanaged Skills'));

  const config = await loadConfig();

  // Build the list of dirs to scan
  const dirsToScan = new Set<string>(DEFAULT_AGENT_DIRS);

  // Add any --dir flags
  for (const d of opts.dir ?? []) {
    dirsToScan.add(d);
  }

  // Optionally add more dirs interactively
  const addMore = await p.confirm({
    message: `Scan ${[...dirsToScan].map(d => pc.dim(d)).join(', ')} — add more directories?`,
    initialValue: false,
  });

  if (p.isCancel(addMore)) { p.cancel('Cancelled'); process.exit(0); }

  if (addMore) {
    let keepAdding = true;
    while (keepAdding) {
      const extra = await p.text({
        message: 'Directory to scan (relative to project root):',
        placeholder: '.agents/skills',
        validate: (v) => (!v.trim() ? 'Path is required' : undefined),
      });
      if (p.isCancel(extra)) { keepAdding = false; break; }
      dirsToScan.add((extra as string).trim());

      const again = await p.confirm({ message: 'Add another directory?', initialValue: false });
      if (p.isCancel(again) || !again) keepAdding = false;
    }
  }

  // Scan
  const spinner = p.spinner();
  spinner.start('Scanning directories...');
  const unmanaged = await collectUnmanaged([...dirsToScan], cwd, config.libraryPath);
  spinner.stop(
    unmanaged.length === 0
      ? pc.green('No unmanaged skills found.')
      : `Found ${pc.yellow(String(unmanaged.length))} unmanaged skill(s)`
  );

  if (unmanaged.length === 0) {
    p.outro(pc.green('Everything looks managed. You\'re good!'));
    return;
  }

  // Show a summary table
  const summaryLines = unmanaged.map((e) => {
    const loc = pc.dim(`${e.agentDir}/${e.name}`);
    const kind = e.isExternalSymlink ? pc.yellow('external symlink') : pc.blue('real folder');
    const lib = e.inLibrary ? pc.green('in library') : pc.dim('not in library');
    return `  ${pc.bold(e.name)}  ${loc}  [${kind}]  [${lib}]`;
  });
  p.note(summaryLines.join('\n'), 'Unmanaged skills');

  // Handle each one interactively
  for (const entry of unmanaged) {
    p.log.step(`\n${pc.bold(entry.name)} — ${pc.dim(entry.agentDir)}`);

    const choices = buildChoices(entry);

    const action = await p.select({
      message: `What do you want to do with "${entry.name}"?`,
      options: choices,
    });

    if (p.isCancel(action)) {
      p.log.warn('Skipping remaining entries.');
      break;
    }

    await applyAction(action as string, entry, config, cwd);
  }

  await saveConfig(config);
  p.outro(pc.green('Scan complete.'));
}

function buildChoices(entry: UnmanagedEntry) {
  const options: { value: string; label: string; hint?: string }[] = [];

  if (entry.inLibrary) {
    options.push({
      value: 'sync',
      label: 'Sync — replace with symlink to library',
      hint: 'Removes the local copy and links to your AgentSync library',
    });
  }

  if (!entry.isExternalSymlink) {
    options.push({
      value: 'import',
      label: entry.inLibrary
        ? 'Import — overwrite library copy with this version'
        : 'Import — copy into AgentSync library',
      hint: 'Adds this skill to your library so it can be shared across agents/profiles',
    });
  }

  options.push({
    value: 'delete',
    label: 'Delete — remove it from this project',
    hint: 'Permanently removes the entry from this directory',
  });

  options.push({ value: 'skip', label: 'Skip — leave it as-is' });

  return options;
}

async function applyAction(
  action: string,
  entry: UnmanagedEntry,
  config: import('../types').AgentSyncConfig,
  cwd: string
): Promise<void> {
  const destLibraryDir = path.join(config.libraryPath, entry.name);

  switch (action) {
    case 'import': {
      const importSpinner = p.spinner();
      importSpinner.start(`Importing "${entry.name}" into library...`);
      try {
        await fs.copy(entry.fullPath, destLibraryDir, { overwrite: true });
        importSpinner.stop(pc.green(`✓ Imported to ${destLibraryDir}`));
      } catch (err) {
        importSpinner.stop(pc.red(`✗ Import failed: ${err instanceof Error ? err.message : String(err)}`));
        return;
      }

      // Offer to assign to a profile
      if (config.profiles.length > 0) {
        const assign = await p.confirm({
          message: `Add "${entry.name}" to a profile?`,
          initialValue: true,
        });
        if (!p.isCancel(assign) && assign) {
          await assignToProfile(entry.name, config);
        }
      }
      break;
    }

    case 'sync': {
      // Remove existing entry, create symlink to library
      const syncSpinner = p.spinner();
      syncSpinner.start(`Replacing with symlink to library...`);
      try {
        await fs.remove(entry.fullPath);
        const result = await createSymlink(
          destLibraryDir,
          path.dirname(entry.fullPath),
          entry.name,
          entry.agentDir
        );
        if (result.status === 'created') {
          syncSpinner.stop(pc.green(`✓ Symlink created → ${destLibraryDir}`));
        } else {
          syncSpinner.stop(pc.yellow(`~ ${result.message ?? result.status}`));
        }
      } catch (err) {
        syncSpinner.stop(pc.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
      }
      break;
    }

    case 'delete': {
      const confirmDelete = await p.confirm({
        message: `Are you sure you want to delete "${entry.name}" from ${entry.agentDir}?`,
        initialValue: false,
      });
      if (p.isCancel(confirmDelete) || !confirmDelete) {
        p.log.info('Delete cancelled.');
        return;
      }
      try {
        await fs.remove(entry.fullPath);
        p.log.success(`Deleted ${entry.fullPath}`);
      } catch (err) {
        p.log.error(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      break;
    }

    case 'skip':
    default:
      p.log.info(`Skipped "${entry.name}"`);
      break;
  }
}

async function assignToProfile(
  skillName: string,
  config: import('../types').AgentSyncConfig
): Promise<void> {
  const profileChoice = await p.select({
    message: 'Select a profile to add it to:',
    options: config.profiles.map((pr) => ({
      value: pr.name,
      label: pr.name,
      hint: pr.description,
    })),
  });

  if (p.isCancel(profileChoice)) return;

  const profile = config.profiles.find((pr) => pr.name === profileChoice);
  if (profile && !profile.skills.includes(skillName)) {
    profile.skills.push(skillName);
    p.log.success(`Added "${skillName}" to profile "${profileChoice as string}"`);
  }
}
