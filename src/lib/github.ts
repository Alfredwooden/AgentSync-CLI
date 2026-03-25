import fs from 'fs-extra';
import path from 'path';
import type { GithubContent, SkillEntry } from '../types';

const VOLTAGENT_README =
  'https://raw.githubusercontent.com/VoltAgent/awesome-agent-skills/main/README.md';
const GITHUB_API = 'https://api.github.com';

// Matches: **[owner/name](https://github.com/owner/repo/tree/branch/path)** - description
const SKILL_LINK_RE =
  /\*\*\[([^\]]+)\]\(https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/([^)]+)\)\*\*\s*-\s*(.+)/g;

function apiHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'agentsync-cli',
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function rawHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = { 'User-Agent': 'agentsync-cli' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export async function fetchSkillList(token?: string): Promise<SkillEntry[]> {
  const res = await fetch(VOLTAGENT_README, {
    headers: { 'User-Agent': 'agentsync-cli' },
  });
  if (!res.ok) throw new Error(`Failed to fetch README: ${res.status} ${res.statusText}`);

  const readme = await res.text();
  const skills: SkillEntry[] = [];
  let match: RegExpExecArray | null;

  while ((match = SKILL_LINK_RE.exec(readme)) !== null) {
    const [, id, owner, repo, branch, repoPath, description] = match;
    skills.push({ id, owner, repo, branch, repoPath: repoPath.trim(), description: description.trim() });
  }

  return skills;
}

export async function downloadSkill(
  skill: SkillEntry,
  destDir: string,
  token?: string
): Promise<void> {
  const apiUrl = `${GITHUB_API}/repos/${skill.owner}/${skill.repo}/contents/${skill.repoPath}?ref=${skill.branch}`;
  await downloadDir(apiUrl, destDir, token);
}

async function downloadDir(apiUrl: string, localDir: string, token?: string): Promise<void> {
  let res = await fetch(apiUrl, { headers: apiHeaders(token) });
  if (!res.ok && res.status === 401 && token) {
    // Token is invalid — retry without it (works for public repos)
    res = await fetch(apiUrl, { headers: apiHeaders() });
  }
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);

  const body = await res.json();

  // Single file (edge case)
  if (!Array.isArray(body)) {
    const item = body as GithubContent;
    if (item.download_url) {
      await fs.ensureDir(localDir);
      const fileRes = await fetch(item.download_url);
      if (!fileRes.ok) throw new Error(`Failed to download ${item.path}`);
      await fs.writeFile(localDir, Buffer.from(await fileRes.arrayBuffer()));
    }
    return;
  }

  const items = body as GithubContent[];
  await fs.ensureDir(localDir);

  for (const item of items) {
    const localPath = path.join(localDir, item.name);
    if (item.type === 'dir') {
      await downloadDir(item.url, localPath, token);
    } else if (item.type === 'file' && item.download_url) {
      let fileRes = await fetch(item.download_url, { headers: rawHeaders(token) });
      if (!fileRes.ok && token) {
        // Retry without token in case it's a bad/fine-grained token on a public file
        fileRes = await fetch(item.download_url, { headers: rawHeaders() });
      }
      if (!fileRes.ok) throw new Error(`Failed to download ${item.path}: ${fileRes.statusText}`);
      await fs.writeFile(localPath, Buffer.from(await fileRes.arrayBuffer()));
    }
  }
}
