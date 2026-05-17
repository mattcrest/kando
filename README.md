# Kando

Local web kanban over Markdown “release” cards. **Card files stay in the Venubase repo** under `venubase-web/docs/roadmap`; this repo is only the UI + API server.

## Layout

Expected sibling directories on disk:

```text
dev/
  kando/              ← this repo
  venubase/
    venubase-web/
      docs/roadmap/   ← canonical vault (git-tracked)
```

If your paths differ, set an absolute path:

```bash
export VENUBASE_ROADMAP_DIR=/path/to/venubase-web/docs/roadmap
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

## Scripts

| Script | Purpose |
|--------|---------|
| `./scripts/kando-dev.sh` | Start / stop / restart / status (preferred for agents and port checks) |
| `npm run dev` | Start API + static UI, open browser |
| `npm run server` | API only (`node electron/server.js`) |
| `npm start` | Electron shell (desktop) |
