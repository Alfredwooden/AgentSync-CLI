import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import type { AgentSyncConfig } from '../types';

export const CONFIG_DIR = path.join(os.homedir(), '.ai-skills');
export const LIBRARY_DIR = path.join(CONFIG_DIR, 'library');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: AgentSyncConfig = {
  libraryPath: LIBRARY_DIR,
  profiles: [
    {
      name: 'frontend-dev',
      description: 'Frontend development with WebGL, ThreeJS, Angular, Performance',
      skills: [],
      targets: [
        { agent: 'cursor', path: '.cursor/rules' },
        { agent: 'claude', path: '.claude/skills' },
        { agent: 'gemini', path: '.gemini/skills' },
        { agent: 'copilot', path: '.github/skills' },
      ],
    },
    {
      name: 'unity-dev',
      description: 'Unity development with C#, Unity API, Game Jam, Physics',
      skills: [],
      targets: [
        { agent: 'cursor', path: '.cursor/rules' },
        { agent: 'claude', path: '.claude/skills' },
        { agent: 'codex', path: '.codex/skills' },
      ],
    },
    {
      name: 'system-admin',
      description: 'System administration with RAID, Media Server, Linux CLI',
      skills: [],
      targets: [
        { agent: 'claude', path: '.claude/skills' },
        { agent: 'gemini', path: '.gemini/skills' },
      ],
    },
  ],
};

export async function loadConfig(): Promise<AgentSyncConfig> {
  await fs.ensureDir(CONFIG_DIR);
  await fs.ensureDir(LIBRARY_DIR);
  if (!await fs.pathExists(CONFIG_FILE)) {
    await fs.writeJson(CONFIG_FILE, DEFAULT_CONFIG, { spaces: 2 });
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
  return fs.readJson(CONFIG_FILE) as Promise<AgentSyncConfig>;
}

export async function saveConfig(config: AgentSyncConfig): Promise<void> {
  await fs.writeJson(CONFIG_FILE, config, { spaces: 2 });
}
