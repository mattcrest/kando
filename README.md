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

### Cursor agent

**kando-dev-server** skill — start/stop Kando. **venubase-roadmap** skill — card edits. **venubase-roadmap-submodule** — pointer to venubase-web for submodule bumps.

## Vault config

- Per-machine overrides: **`vaults.json`** (gitignored). Copy from `vaults.example.json`.
- Default venubase path: `../venubase/venubase-web/docs/roadmap` (see `electron/server.js`).

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
| `npm run dev` | Start API + static UI, open browser |
| `npm run server` | API only |
| `npm start` | Electron shell |
