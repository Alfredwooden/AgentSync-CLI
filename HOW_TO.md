# AgentSync — Usage Guide

## Installation

```shell
git clone https://github.com/your-username/agentsync
cd agentsync
npm install
npm run build
npm link
```

---

## Command Walkthrough

### `agentsync init`

Run once per project to create the agent directories.

```shell
cd ~/my-project
agentsync init
```

Detects existing tools (e.g. if `.cursor/` already exists) and presents a checklist. Pick which agent dirs to create (`.claude/skills`, `.cursor/rules`, etc.).

---

### `agentsync create`

Create a new skill locally, or optionally pull one from the online registry.

```shell
agentsync create
```

Choose **Local** to create a skill from scratch — no internet needed. AgentSync scaffolds a `SKILL.md` template in `~/.ai-skills/library/<skill-name>/` and optionally adds it to a profile.

Choose **VoltAgents** to browse the [awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) registry and download a skill *(requires internet — see `pull` below)*.

---

### `agentsync pull` *(optional, requires internet)*

Browse and download skills from the VoltAgent registry directly.

```shell
agentsync pull
```

Presents a searchable multi-select TUI. Selected skills download to `~/.ai-skills/library/<skill-name>/`.

A GitHub token is optional but avoids API rate limits:

```shell
export GITHUB_TOKEN=ghp_yourtoken
# or enter it interactively when prompted — AgentSync can save it for you
```

---

### `agentsync link --profile <name>`

The core command. Symlinks skills from your global library into the current project's agent folders.

```shell
agentsync link --profile my-profile
```

- On first run, if the profile has no skills assigned yet, it asks you to pick from your library and saves the selection to `~/.ai-skills/config.json`.
- On subsequent runs, it re-links everything immediately.

Result: `.claude/skills/my-skill -> ~/.ai-skills/library/my-skill` (symlink, not a copy). Edit the skill once and all linked projects see the change instantly.

---

### `agentsync unlink [--profile <name>]`

Removes symlinks from the current project. The global library is never touched.

```shell
agentsync unlink --profile my-profile   # unlink one profile
agentsync unlink                         # unlink everything in this project
```

---

### `agentsync scan`

Find skill files in the current project that aren't managed by AgentSync yet.

```shell
agentsync scan
agentsync scan --dir ./extra-skills     # scan an additional directory
```

For each unmanaged file, choose to: sync it into the library, import it in place, delete it, or skip.

---

### `agentsync doctor`

Audit the current project and your library for problems.

```shell
agentsync doctor
```

Checks for:

- Broken symlinks (source was deleted or moved)
- Skills in your library missing a `SKILL.md` file
- Profiles referencing skills that don't exist in the library

Exits with code `1` if issues are found — works in CI.

---

## Workflows

### Offline-only (no registry)

```shell
agentsync init                            # set up agent dirs
agentsync create                          # create a skill locally
agentsync link --profile my-profile       # activate for this project
```

### Using the registry

```shell
agentsync init
agentsync pull                            # browse and download skills
agentsync link --profile my-profile
```

### Switching contexts

```shell
agentsync unlink --profile frontend-dev
agentsync link --profile backend-api
```

### Routine health check

```shell
agentsync doctor
```

---

## Config

Global config lives at `~/.ai-skills/config.json`. Three starter profiles (`frontend-dev`, `unity-dev`, `system-admin`) are created on first run. Edit the file directly to add profiles, change target paths, or remove the defaults.

Example profile entry:

```json
{
  "name": "backend-api",
  "description": "Node.js, REST, PostgreSQL",
  "skills": ["node-best-practices", "sql-guidelines"],
  "targets": [
    { "agent": "claude", "path": ".claude/skills" },
    { "agent": "cursor", "path": ".cursor/rules" }
  ]
}
```

---

## Skill Structure

```text
skill-name/
├── SKILL.md      # Required — summary + trigger hints
├── references/   # Optional — deep docs loaded on demand
└── scripts/      # Optional — executable helpers
```

Keep `SKILL.md` short (~100 tokens). Use the `references/` folder for detailed content the AI only needs when specifically triggered — this keeps token usage low on unrelated requests.
