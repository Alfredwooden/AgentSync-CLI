# AgentSync

A CLI tool for managing AI coding assistant skills and instructions across multiple tools and projects.

AgentSync maintains a **single source of truth** for your AI instructions in a global library (`~/.ai-skills/library/`) and uses symbolic links to wire them into project-specific agent folders. Update a skill once — every project that uses it picks up the change instantly.

Works fully **offline** by default. The optional registry integration requires internet access.

## Supported Agents

| Agent | Target path |
|---|---|
| Claude Code | `.claude/skills/` |
| Cursor | `.cursor/rules/` |
| Gemini CLI | `.gemini/skills/` |
| GitHub Copilot | `.github/skills/` |
| Codex | `.codex/skills/` |

## Profiles

Profiles let you activate a named set of skills per project. Switch between them as you move across codebases.

```shell
agentsync link --profile backend-api
agentsync unlink --profile backend-api
agentsync link --profile frontend-ui
```

Three starter profiles are created automatically: `frontend-dev`, `unity-dev`, `system-admin`. You can edit `~/.ai-skills/config.json` to add your own.

## Commands

| Command | Description |
|---|---|
| `agentsync init` | Create agent directories in the current project |
| `agentsync create` | Create a new skill locally, or pull one from the registry |
| `agentsync pull` | Browse and download skills from the VoltAgent registry *(requires internet)* |
| `agentsync link --profile <name>` | Symlink a profile's skills into the current project |
| `agentsync unlink [--profile <name>]` | Remove symlinks from the current project |
| `agentsync scan` | Find unmanaged skill files and decide what to do with them |
| `agentsync doctor` | Check for broken symlinks and config issues |

## Skill Structure

Every skill in `~/.ai-skills/library/` follows this layout:

```text
skill-name/
├── SKILL.md      # Required — short summary and trigger hints for the AI
├── references/   # Optional — deep docs the AI loads on demand
└── scripts/      # Optional — executable helpers
```

The `SKILL.md` acts as an entry point: a ~100-token summary the AI reads first. It can reference files in `references/` for deeper context, keeping token usage low on requests that don't need the full skill.

## Installation

```shell
git clone https://github.com/your-username/agentsync
cd agentsync
npm install
npm run build
npm link
```

See [HOW_TO.md](./HOW_TO.md) for a full usage walkthrough.

## License

MIT
