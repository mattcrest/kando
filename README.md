# Kando

Local web kanban over Markdown “release” cards. **Card files live in [venubase-roadmap](https://github.com/mattcrest/venubase-roadmap)** — checked out inside `venubase-web` as `docs/roadmap/` (git submodule). This repo is only the UI + API server.

## Layout

```text
dev/
  kando/                         ← this repo (UI + API)
  venubase/
    venubase-web/
      docs/roadmap/              ← git submodule → venubase-roadmap (canonical edit path)
```

**Use one path for edits:** `venubase-web/docs/roadmap/`. Point Kando’s venubase vault there. Avoid a second standalone `venubase-roadmap` clone unless you `git pull` it every session.

After cloning venubase-web:

```bash
git submodule update --init docs/roadmap
```

Override path in `vaults.json` or:

```bash
export VENUBASE_ROADMAP_DIR=/path/to/venubase-web/docs/roadmap
```

## Setup

```bash
cd /path/to/kando
npm install
cp vaults.example.json vaults.json
npm run dev
```

Opens **http://127.0.0.1:3001** (see `kando-start.js`).

### Dev server helper

```bash
./scripts/kando-dev.sh start    # install deps if needed, start, wait for health
./scripts/kando-dev.sh status
./scripts/kando-dev.sh stop
./scripts/kando-dev.sh restart
./scripts/kando-dev.sh stop --force   # free port 3001 if another process holds it
```

### Agents (any tool)

**[docs/agent-routing.md](docs/agent-routing.md)** — agent-agnostic workflow: resolve workspace via HTTP API, read per-project conventions, edit `release-*.md`. Works without Cursor.

**[AGENTS.md](AGENTS.md)** — entry point; also read by many agents automatically.

### Agent integrations (optional)

Bundled **skills** live in `.cursor/skills/` (Cursor format; also used by Codex and Claude Code installers).

**One command** (Cursor, Codex, Claude, Copilot, Gemini + optional app repos):

```bash
./scripts/install-agent-integrations.sh --all

# Or map your app repos explicitly:
./scripts/install-agent-integrations.sh --cursor \
  --app-repo ~/dev/venubase/venubase-web \
  --app-repo ~/dev/playerpath/playerpath-web
```

| Skill | Purpose |
|-------|---------|
| `kando-roadmap-router` | Resolve workspace → vault via `routing`; edit cards per project conventions |
| `kando-dev-server` | Start/stop Kando on port 3001 |
| `venubase-roadmap` | Venubase card workflow (optional; after router) |
| `venubase-roadmap-submodule` | Venubase `docs/roadmap` submodule bump |

Per-tool scripts: `install-cursor-skills.sh`, `install-codex-skills.sh`, `install-claude-skills.sh`, etc. See [templates/agents/README.md](templates/agents/README.md).

## Vault config

- Per-machine overrides: **`vaults.json`** (gitignored). Copy from `vaults.example.json`.
- Default venubase path: `../venubase/venubase-web/docs/roadmap` (see `electron/server.js`).

### Cross-project routing (`routing`)

Map app repos to roadmap vaults so agents (and tools) know which `release-*.md` tree to use:

```json
"routing": {
  "venubase": {
    "workspaceRoots": ["/path/to/venubase-web", "/path/to/venubase/worktrees/*"],
    "conventionsFile": "roadmap-conventions.md",
    "indexFile": "roadmap-index.md",
    "canonicalRepo": "your-org/venubase-roadmap"
  }
}
```

- **`workspaceRoots`**: exact paths or glob patterns (`*`). First matching vault wins.
- **`conventionsFile` / `indexFile`**: filenames inside the vault directory.

**API**

| Endpoint | Purpose |
|----------|---------|
| `GET /api/vaults` | Lists vaults; each entry includes `routing`; top-level `routing` object |
| `GET /api/routing/resolve?workspaceRoot=<path>` | Resolve vault + conventions paths for a workspace |

Example:

```bash
curl -s "http://127.0.0.1:3001/api/routing/resolve?workspaceRoot=$PWD"
```

Adding a new project: set `vaults.<key>`, `routing.<key>.workspaceRoots`, and optional `canonicalRepo` — no skill edits required.

### Git sync

Kando **Commit & Push** updates **venubase-roadmap** only (not venubase-web).

```json
"git": {
  "venubase": {
    "autoCommit": true,
    "autoPush": false
  }
}
```

Or `KANDO_AUTO_GIT_COMMIT=1`. Submodule bump in venubase-web: `./scripts/bump-roadmap-submodule.sh` (see venubase-web **venubase-roadmap-submodule** skill). Bump lazily — PR roadmap links use `github.com/mattcrest/venubase-roadmap/...`.

API: `GET /api/vaults/:name/git/status`, `POST /api/vaults/:name/git/sync`

## Scripts

| Script | Purpose |
|--------|---------|
| `./scripts/kando-dev.sh` | Start / stop / restart / status |
| `./scripts/install-agent-integrations.sh` | Install skills/snippets for Cursor, Codex, Claude, Copilot, Gemini |
| `./scripts/install-cursor-skills.sh` | Cursor only (`~/.cursor/skills/`) |
| `npm run dev` | Start API + static UI, open browser |
| `npm run server` | API only |
| `npm start` | Electron shell |
