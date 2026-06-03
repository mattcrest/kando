# Agent integration templates

Kando’s **canonical** routing spec is [`../../docs/agent-routing.md`](../../docs/agent-routing.md).

## One-command install (recommended)

From the Kando repo:

```bash
./scripts/install-agent-integrations.sh --all
```

| Flag | Tool | What it does |
|------|------|----------------|
| `--cursor` | Cursor | Symlinks skills → `~/.cursor/skills/` |
| `--codex` | OpenAI Codex | Symlinks skills → `~/.codex/skills/` |
| `--claude` | Claude Code | Skills + `~/.claude/CLAUDE.md` block |
| `--copilot` | GitHub Copilot | `~/.copilot/copilot-instructions.md` block |
| `--gemini` | Gemini CLI | `~/.gemini/GEMINI.md` block |
| `--app-repo PATH` | Any (AGENTS.md) | Appends pointer to repo `AGENTS.md` |

Set `KANDO_HOME=/path/to/kando` if the repo is not at the default checkout path.

## Per-app repo (optional)

```bash
./scripts/install-app-repo-snippet.sh ~/dev/venubase/venubase-web
./scripts/install-app-repo-snippet.sh ~/dev/playerpath/playerpath-web
```

Or copy [`kando-agents-snippet.md`](kando-agents-snippet.md) into your project `AGENTS.md` manually.

## Tools without installers

Any agent can read:

- `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` in the **Kando** repo when that repo is open
- `docs/agent-routing.md` + `vaults.json` from any workspace if you set `KANDO_HOME`
