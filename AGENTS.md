# Kando — agent guidance

Kando is a local kanban UI + API over Markdown `release-*.md` roadmap cards in Tolaria-style vaults.

## Agent-agnostic routing (canonical)

**Any agent** should use [docs/agent-routing.md](docs/agent-routing.md):

1. `GET /api/routing/resolve?workspaceRoot=<app-repo>` on port **3001**
2. Read `conventionsPath` and `indexPath` from the response
3. Edit `release-*.md` under `vaultPath` per that project’s conventions

Routing config lives in **`vaults.json`** (`routing` section). No agent-specific mapping tables are required.

## Configuration

- Copy [`vaults.example.json`](vaults.example.json) → `vaults.json` (gitignored).
- See [README.md](README.md) for setup, git sync, and API tables.

## Install for your agents

```bash
./scripts/install-agent-integrations.sh --all
```

Installs Cursor, Codex, and Claude Code **skills**, plus memory snippets for Claude / Copilot / Gemini. Use `--app-repo <path>` to patch an app repo’s `AGENTS.md`. See [templates/agents/README.md](templates/agents/README.md).

| Skill | Use when |
|-------|----------|
| **kando-roadmap-router** | Kando / roadmap / `release-*.md` in any mapped app repo |
| **kando-dev-server** | Start or stop Kando locally |
| **release-card-writing** | Draft or rewrite cards for product-builder readability |
| **venubase-roadmap** | Venubase-specific card workflow |
| **venubase-roadmap-submodule** | Venubase `docs/roadmap` submodule bump |

Skills also load when the **Kando repo** is the active workspace (`.cursor/skills/`).

## Optional: Cursor rules

Pointer rules in [`.cursor/rules/`](.cursor/rules/) — discoverability only; logic stays in `vaults.json` and `docs/agent-routing.md`.
