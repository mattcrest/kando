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

## Vault config

- Per-machine overrides: **`vaults.json`** (gitignored). Copy from `vaults.example.json`.
- Merged with defaults from `electron/server.js` (`venubase` → `VENUBASE_ROADMAP_DIR` or sibling path above).

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start API + static UI, open browser |
| `npm run server` | API only (`node electron/server.js`) |
| `npm start` | Electron shell (desktop) |
