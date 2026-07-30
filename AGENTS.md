# Kando — agent guidance

Kando is a local kanban UI + API over Markdown roadmap cards in Tolaria-style vaults. Cards form a three-layer hierarchy: **initiatives** (`initiative-*.md`, `initiative: true`) → **epics** (`release-epic-*.md`, `epic: true`, `initiative:` wikilink) → **story slices** (`release-*.md`, `epic:` wikilink). The UI has a kanban **Board** and a Now/Next/Later **Strategy** view; the API exposes `is_epic` / `is_initiative` / `horizon` / `milestone` / `parent` per card plus `GET/PUT /api/initiatives/:id/epics` for managing an initiative's epic list.

## Agent-agnostic routing (canonical)

**Any agent** should use [docs/agent-routing.md](docs/agent-routing.md):

1. `GET /api/routing/resolve?workspaceRoot=<app-repo>` on port **3001**
2. Read `conventionsPath`, `indexPath`, and fetch `cardContractPath` from the response
3. Edit `release-*.md` under `vaultPath` per that project’s conventions — **never invent frontmatter fields**; validate with `POST /api/cards/validate` before and after writing

Routing config lives in **`vaults.json`** (`routing` section). No agent-specific mapping tables are required.

**Whenever you edit a slice, also update its `agent_status` / `agent_provider` / `agent_summary` / `agent_next` / `agent_updated_at` frontmatter** — this is what Kando's **Workbench** view surfaces to the user as "what's being worked on and why," so it needs to reflect reality, not what it said last time. See [docs/agent-routing.md](docs/agent-routing.md#5-keep-progress-tracking-current). If asked to suggest what to work on next, write the ranked list to `agent-suggestions.md` in the vault instead of only replying in chat (§6 of the same doc) — that's what populates Workbench's "up next" list.

## Portable agent pack (app repos + cloud)

For agents working in **app repos** or **cloud** (Cursor Cloud, Claude Code remote), sync the vendored pack:

```bash
./scripts/sync-agent-pack.sh --app-repo /path/to/app \
  --vault-key <key> --vault-hint docs/roadmap --canonical-repo org/roadmap-repo
```

Commits `.kando/`, project skills, `kando.agent.json`, and `AGENTS.md`/`CLAUDE.md` blocks — no `KANDO_HOME` or localhost required for cold start. See [docs/agent-routing.md](docs/agent-routing.md#offline-and-cloud-agents).

## Configuration

- Copy [`vaults.example.json`](vaults.example.json) → `vaults.json` (gitignored).
- See [README.md](README.md) for setup, git sync, and API tables.

## Install for your agents

```bash
./scripts/install-agent-integrations.sh --all
```

Installs Cursor, Codex, and Claude Code **skills** (global symlinks), plus memory snippets for Claude / Copilot / Gemini. Use `--app-repo` / `--vault` to sync the portable pack. See [templates/agents/README.md](templates/agents/README.md).

| Skill | Use when |
|-------|----------|
| **kando-roadmap-router** | Kando / roadmap / `release-*.md` in any mapped app repo |
| **kando-dev-server** | Start or stop Kando locally |
| **release-card-writing** | Draft or rewrite cards for product-builder readability |
| **kando-strategy-setup** | Interview user and scaffold Strategy initiatives (Now/Next/Later) |
| **venubase-roadmap** | Venubase-specific paths only (not vendored to other repos) |
| **venubase-roadmap-submodule** | Venubase `docs/roadmap` submodule bump (Venubase only) |

Skills also load when the **Kando repo** is the active workspace (`.cursor/skills/`).

## Optional: Cursor rules

Pointer rules in [`.cursor/rules/`](.cursor/rules/) — discoverability only; logic stays in `vaults.json` and `docs/agent-routing.md`.
