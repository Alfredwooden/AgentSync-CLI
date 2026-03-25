System Role: You are a Senior Tooling Engineer.

Task: Create a Node.js CLI tool called AgentSync (TypeScript) to manage AI Agent Skills via symlinks across multiple LLM environments.

Core Feature: Profile-Based Orchestration
Implement a profiles.json configuration that allows the user to switch "contexts" instantly:

Frontend-Dev Profile:

Target Paths: .cursor/skills/, .claude/skills/, .gemini/skills/, .github/skills/

Action: When running agentsync link --profile frontend, it symlinks specific skill folders (e.g., threejs-perf, angular-optimization) from a central ~/.ai-skills/library to these local project directories.

Unity-Dev Profile:

Target Paths: .cursor/skills/, .claude/skills/, .codex/skills/

Action: Symlinks specialized instruction folders for C#, Unity Engine API, and Game Jam Prototyping.

Technical Specifications:

Standardized Skill Structure: The tool must ensure every skill it "installs" or "links" follows the standard 2026 layout:

Plaintext
skill-name/
├── SKILL.md      # (Required) YAML frontmatter (name, description) + instructions.
├── references/  # (Optional) Deep documentation loaded on-demand.
└── scripts/     # (Optional) Executable code (Python/Bash) the agent can run.
VoltAgent Discovery: Use the GitHub API to browse VoltAgent/awesome-agent-skills. Create an interactive TUI (using clack or enquirer) that lets the user search the repo and "Download" a skill directly into their global ~/.ai-skills/library.

Symlink Engine: Use fs.symlinkSync. The tool must automatically create any missing parent directories (like .claude/ or .cursor/) before creating the symlink.

Cleanup: Include an agentsync unlink command that safely removes symlinks from the current project without touching the global library.

Output: Provide the package.json and a modular index.ts that handles the profile logic and symlinking.