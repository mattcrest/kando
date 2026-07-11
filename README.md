# Kando

Local kanban UI and HTTP API for **Markdown roadmap cards** (`release-*.md`) in [Tolaria](https://github.com/refactoringhq/tolaria)-style vaults. Kando does not own your card files — it points at one or more vault directories on disk and can sync each vault’s git repo independently.

Use it to plan releasable slices, drag cards across columns, and let coding agents resolve **which roadmap belongs to which app repo** via a single config file.

## Features

- **Multi-vault** — Venubase, PlayerPath, or any project; switch vaults in the UI
- **Three-layer hierarchy** — initiatives (`initiative: true`) → epics (`epic: true`) → story slices, linked by frontmatter wikilinks (`initiative:` on epics, `epic:` on slices)
- **Board + Strategy views** — kanban board for execution; a Now/Next/Later roadmap of initiative rows with per-epic slice progress (header toggle)
- **Card-type filter** — All / Initiatives / Epics / Slices dropdown in the header
- **Initiative epic manager** — drag-to-reorder, add/remove, and annotate an initiative's epics from the card modal; writes the card's `## Epics` table and each epic's `initiative:` link
- **Cross-project routing** — `vaults.json` maps app repo paths → roadmap vault + convention files
- **Agent-agnostic API** — `GET /api/routing/resolve` for Cursor, Claude Code, Codex, Copilot, Gemini, or custom tools
- **Bundled agent integrations** — optional install scripts for common assistants ([templates/agents/README.md](templates/agents/README.md))
- **Git sync per vault** — commit/push roadmap changes from the Kando header (optional auto-commit on save)

## Quick start

```bash
git clone <your-fork-or-origin-url> kando
cd kando
npm install
cp vaults.example.json vaults.json
# Edit vaults.json: set vault paths and routing.workspaceRoots for your machine
npm run dev
```

Opens **http://127.0.0.1:3001** (or run `./scripts/kando-dev.sh start`).

```bash
./scripts/kando-dev.sh status   # check health
./scripts/kando-dev.sh stop
./scripts/kando-dev.sh restart
```

## How it fits together

```text
  app repo (e.g. venubase-web, playerpath-web)
       │
       │  routing.workspaceRoots in vaults.json
       ▼
  Kando (:3001)  ──►  roadmap vault directory
       │                 release-*.md
       │                 roadmap-conventions.md
       │                 roadmap-index.md
       └── git sync ──►  vault’s own git repo (may differ from app repo)
```

**This repo** = UI + API only. **Roadmap markdown** lives wherever you configure each vault path (submodule, sibling repo, or folder inside an app repo).

### Card hierarchy (frontmatter contract)

| Layer | Marker | Parent link | Shown in |
|-------|--------|-------------|----------|
| **Initiative** | `initiative: true` (+ optional `horizon: Now\|Next\|Later`, `milestone:`) | — | Strategy view lanes |
| **Epic** | `epic: true` | `initiative: '[[initiative-<slug>]]'` | Board; initiative epic manager |
| **Story slice** | neither flag | `epic: '[[release-epic-<slug>]]'` | Board; epic sidebar slice list |

All layers still require `release: true` to appear in Kando. The card modal derives its breadcrumb (Initiative › Epic › Slice) and progress roll-ups from these links. Per-vault details live in each vault's `roadmap-conventions.md`.

## Configuration (`vaults.json`)

Copy [`vaults.example.json`](vaults.example.json) → `vaults.json` (gitignored). Set absolute paths on your machine.

| Key | Purpose |
|-----|---------|
| `vaults` | Vault id → filesystem path to markdown root |
| `routing` | Vault id → `workspaceRoots`, convention filenames, optional `canonicalRepo` |
| `default` | Default vault in the UI |
| `git` | Per-vault auto-commit / push settings |
| `colors` | UI accent per vault |

### Routing example (two projects)

```json
{
  "vaults": {
    "venubase": "/path/to/venubase-roadmap",
    "playerpath": "/path/to/playerpath-web/PlayerPath - Tolaria"
  },
  "routing": {
    "venubase": {
      "workspaceRoots": ["/path/to/venubase-web", "/path/to/venubase/worktrees/*"],
      "conventionsFile": "roadmap-conventions.md",
      "indexFile": "roadmap-index.md",
      "canonicalRepo": "your-org/venubase-roadmap"
    },
    "playerpath": {
      "workspaceRoots": ["/path/to/playerpath-web"],
      "conventionsFile": "roadmap-conventions.md",
      "indexFile": "roadmap-index.md",
      "canonicalRepo": "your-org/playerpath-web"
    }
  }
}
```

- **`workspaceRoots`**: exact paths or globs (`*`). First match wins.
- **Adding a project**: new `vaults` + `routing` entries only — no code changes.

Override the default Venubase path without editing `vaults.json`:

```bash
export VENUBASE_ROADMAP_DIR=/path/to/roadmap-vault
```

## HTTP API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Server status and vault keys |
| `GET /api/vaults` | Vault list with `routing` metadata |
| `GET /api/routing/resolve?workspaceRoot=<path>` | Map an app repo → vault + convention paths |
| `GET /api/cards?vault=<key>` | List `release: true` cards (includes `is_epic`, `is_initiative`, `horizon`, `milestone`, `parent`) |
| `GET/PUT /api/cards/:id` | Read/update card metadata and body |
| `GET/PUT /api/initiatives/:id/epics` | Read/reorder/add/remove an initiative's epics (syncs `## Epics` table + epic `initiative:` frontmatter) |
| `GET/PUT /api/roadmap-index?vault=<key>` | Read/update queue order in `roadmap-index.md` |
| `GET /api/vaults/:name/git/status` | Git status for vault directory |
| `POST /api/vaults/:name/git/sync` | Commit and optional push |

```bash
curl -s "http://127.0.0.1:3001/api/routing/resolve?workspaceRoot=$PWD"
```

Full agent workflow: **[docs/agent-routing.md](docs/agent-routing.md)**. Entry point for tools that read **`AGENTS.md`** / **`CLAUDE.md`** in this repo.

## Coding agents

Install skills and memory snippets once (paths use `KANDO_HOME` if set):

```bash
export KANDO_HOME=/path/to/kando   # optional
npm run install:agents
# same as: ./scripts/install-agent-integrations.sh --all
```

| Flag | Tool |
|------|------|
| `--cursor` | Cursor → `~/.cursor/skills/` |
| `--codex` | OpenAI Codex → `~/.codex/skills/` |
| `--claude` | Claude Code skills + `~/.claude/CLAUDE.md` |
| `--copilot` | GitHub Copilot → `~/.copilot/copilot-instructions.md` |
| `--gemini` | Gemini → `~/.gemini/GEMINI.md` |
| `--app-repo PATH` | Append pointer block to that repo’s `AGENTS.md` |

| Skill | Purpose |
|-------|---------|
| `kando-roadmap-router` | Resolve workspace → vault; follow per-project conventions |
| `kando-dev-server` | Start/stop Kando on port 3001 |
| `venubase-roadmap` | Venubase-specific card workflow (optional) |
| `venubase-roadmap-submodule` | Venubase `docs/roadmap` submodule bump (optional) |

Details: [templates/agents/README.md](templates/agents/README.md).

## Git sync

Kando’s **Commit & Push** operates on the **vault directory’s** git repo (not necessarily the app repo).

```json
"git": {
  "venubase": { "autoCommit": true, "autoPush": false, "remote": "origin", "branch": "main" }
}
```

Or `KANDO_AUTO_GIT_COMMIT=1` globally.

**Push fails with “could not read Username for https://github.com”?** Kando retries via SSH when HTTPS has no credentials (common when the server runs non-interactively). Ensure your GitHub SSH key is loaded (`ssh -T git@github.com`). Prefer SSH remotes: `git remote set-url origin git@github.com:ORG/venubase-roadmap.git`.

## Example: Venubase layout

```text
dev/
  kando/
  venubase-roadmap/              ← Kando vault (canonical — edit cards here)
  venubase/venubase-web/
    docs/roadmap/                 ← git submodule pin (same repo, not the Kando path)
```

- Point the `venubase` vault at the **`venubase-roadmap`** checkout (sibling of `kando` under `dev/`).
- Kando **Commit & Push** updates **`venubase-roadmap`** on GitHub.
- `venubase-web/docs/roadmap/` is a submodule for the app repo; bump it when collaborators need a fresh pin on `main` — not for every card edit. See **venubase-roadmap-submodule** (venubase-web or Kando skills).
- PR roadmap links: `https://github.com/<org>/venubase-roadmap/blob/main/release-<slug>.md`
- Do **not** point Kando at `docs/roadmap/` unless you intentionally have no standalone `venubase-roadmap` clone (easy to drift from the repo you push).

## Scripts & npm commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | API + static UI (opens browser) |
| `npm run server` | API only |
| `npm start` | Electron shell |
| `npm run install:agents` | Install agent integrations (`--all`) |
| `npm run install:cursor-skills` | Cursor skills only |
| `./scripts/kando-dev.sh` | Start / stop / restart / status |
| `./scripts/install-agent-integrations.sh` | Per-tool agent install |
| `./scripts/install-app-repo-snippet.sh <repo>` | Add Kando block to app `AGENTS.md` |
