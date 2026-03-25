import fs from 'fs-extra';
import path from 'path';

export interface SymlinkResult {
  skill: string;
  target: string;
  agent: string;
  status: 'created' | 'exists' | 'error';
  message?: string;
}

export async function createSymlink(
  sourcePath: string,
  targetDir: string,
  skillName: string,
  agent: string
): Promise<SymlinkResult> {
  const linkPath = path.join(targetDir, skillName);
  const base = { skill: skillName, target: targetDir, agent };

  try {
    if (!await fs.pathExists(sourcePath)) {
      return { ...base, status: 'error', message: `Source not found: ${sourcePath}` };
    }

    await fs.ensureDir(targetDir);

    let existingStat;
    try {
      existingStat = await fs.lstat(linkPath);
    } catch {
      // doesn't exist — fall through to create
    }

    if (existingStat) {
      if (existingStat.isSymbolicLink()) return { ...base, status: 'exists' };
      return { ...base, status: 'error', message: `Path exists and is not a symlink: ${linkPath}` };
    }

    await fs.symlink(sourcePath, linkPath, 'dir');
    return { ...base, status: 'created' };
  } catch (err) {
    return { ...base, status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function removeSymlink(
  targetDir: string,
  skillName: string
): Promise<{ removed: boolean; message?: string }> {
  const linkPath = path.join(targetDir, skillName);

  try {
    const stat = await fs.lstat(linkPath);
    if (!stat.isSymbolicLink()) return { removed: false, message: 'Not a symlink, skipping' };
    await fs.unlink(linkPath);
    return { removed: true };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { removed: false, message: 'Not found' };
    return { removed: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function checkSymlink(linkPath: string): Promise<'valid' | 'broken' | 'missing' | 'not-symlink'> {
  try {
    const lstat = await fs.lstat(linkPath);
    if (!lstat.isSymbolicLink()) return 'not-symlink';
    const target = await fs.readlink(linkPath);
    return await fs.pathExists(target) ? 'valid' : 'broken';
  } catch {
    return 'missing';
  }
}
