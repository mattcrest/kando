# Agent integration templates

Kando’s **canonical** routing spec is [`../../docs/agent-routing.md`](../../docs/agent-routing.md).

## Portable agent pack (recommended for app repos + cloud)

Sync a self-contained pack into app repos and roadmap vaults — works for **Cursor Cloud** and **Claude Code cloud** without local Kando or home-dir skills:

```bash
./scripts/sync-agent-pack.sh --app-repo /path/to/app \
  --vault-key myproject \
  --vault-hint docs/roadmap \
  --canonical-repo org/myproject-roadmap

# Standalone roadmap vault (skills + .kando/ only):
./scripts/sync-agent-pack.sh --vault /path/to/roadmap-vault
```

**Committed in app repos:** `.kando/`, `.cursor/skills/`, `.claude/skills/`, `kando.agent.json`, marked blocks in `AGENTS.md` and `CLAUDE.md`.

Pack source: [`../agent-pack/`](../agent-pack/). Regenerate contract: `npm run generate:agent-pack`.

## One-command install (local machine)

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
| `--app-repo PATH` | Any | Sync portable agent pack into that repo |
| `--vault PATH` | Any | Sync `.kando/` + skills into roadmap vault repo |

Set `KANDO_HOME=/path/to/kando` if the repo is not at the default checkout path.

## Per-app repo

```bash
./scripts/sync-agent-pack.sh --app-repo ~/dev/venubase/venubase-web \
  --vault-key venubase --vault-hint docs/roadmap --vault-hint ../venubase-roadmap \
  --canonical-repo mattcrest/venubase-roadmap
```

Or copy [`kando-agents-pack-snippet.md`](kando-agents-pack-snippet.md) into your project `AGENTS.md` manually and run sync for `.kando/` + skills.

## Pack skills (generic, vendored)

| Skill | Purpose |
|-------|---------|
| `kando-roadmap-router` | Resolve vault; API-first, offline fallback |
| `release-card-writing` | Readable card bodies + validation |
| `kando-strategy-setup` | Scaffold Now/Next/Later initiatives |

**Not vendored:** `venubase-roadmap`, `venubase-roadmap-submodule`, `kando-dev-server` (local-only).

## Tools without installers

Any agent can read:

- `.kando/kando-for-agents.md` in a synced app repo (cloud-friendly)
- `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` in the **Kando** repo when that repo is open
- `docs/agent-routing.md` + `vaults.json` from any workspace if you set `KANDO_HOME`
