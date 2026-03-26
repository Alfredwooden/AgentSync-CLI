export interface AgentTarget {
  agent: string;
  path: string;
  /** 'skill' = directory symlink (default); 'agent' = single-file symlink */
  type?: 'skill' | 'agent';
}

export interface Profile {
  name: string;
  description: string;
  skills: string[];
  targets: AgentTarget[];
}

export interface AgentSyncConfig {
  libraryPath: string;
  githubToken?: string;
  profiles: Profile[];
}

export interface GithubContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  download_url: string | null;
  type: 'file' | 'dir';
}

export interface SkillEntry {
  id: string;         // e.g. "anthropics/docx"
  description: string;
  owner: string;
  repo: string;
  branch: string;
  repoPath: string;   // path within the repo, e.g. "skills/docx"
}
