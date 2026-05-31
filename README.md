# Kando

Local web kanban over Markdown “release” cards. **Card files live in [venubase-roadmap](https://github.com/mattcrest/venubase-roadmap)** — a dedicated repo, checked out inside `venubase-web` as `docs/roadmap/` (git submodule). This repo is only the UI + API server.

## Layout

Expected sibling directories on disk:

```text
dev/
  kando/                    ← this repo (UI + API)
  venubase-roadmap/         ← canonical roadmap cards (optional direct clone)
  venubase/
    venubase-web/
      docs/roadmap/         ← git submodule → venubase-roadmap
```

After cloning venubase-web: `git submodule update --init docs/roadmap`

If your paths differ, set an absolute path:

```bash
export VENUBASE_ROADMAP_DIR=/path/to/venubase-web/docs/roadmap
# or clone venubase-roadmap directly:
export VENUBASE_ROADMAP_DIR=/path/to/venubase-roadmap
```

## Setup

```bash
cd /path/to/kando
npm install
cp vaults.example.json vaults.json
# Edit vaults.json if you use extra vaults or non-default paths
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

### Cursor agent

This repo includes a **kando-dev-server** skill and rule (`.cursor/skills/`, `.cursor/rules/`). In chat, ask to **start Kando** and the agent should run `scripts/kando-dev.sh` and confirm http://127.0.0.1:3001 is healthy.

## Vault config

- Per-machine overrides: **`vaults.json`** (gitignored). Copy from `vaults.example.json`.
- Merged with defaults from `electron/server.js` (`venubase` → `VENUBASE_ROADMAP_DIR` or sibling path above).

### Git sync

When a vault directory is a git repo (e.g. the `venubase-roadmap` submodule), Kando shows **Commit & Push** in the header.

Optional auto-commit on every card save — in `vaults.json`:

```json
"git": {
  "venubase": {
    "autoCommit": true,
    "autoPush": false
  }
}
```

Or set `KANDO_AUTO_GIT_COMMIT=1` for all vaults. Auto-push requires `"autoPush": true`.

API: `GET /api/vaults/:name/git/status`, `POST /api/vaults/:name/git/sync`

## Scripts

| Script | Purpose |
|--------|---------|
| `./scripts/kando-dev.sh` | Start / stop / restart / status (preferred for agents and port checks) |
| `npm run dev` | Start API + static UI, open browser |
| `npm run server` | API only (`node electron/server.js`) |
| `npm start` | Electron shell (desktop) |
