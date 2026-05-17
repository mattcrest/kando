---
name: kando-dev-server
description: >-
  Start, stop, restart, or check the local Kando kanban dev server on port 3001.
  Use when the user asks to start, run, open, launch, stop, or restart Kando,
  or wants the roadmap kanban UI at localhost:3001.
---

# Kando dev server

Run the local Kando UI from **this repo** (`/Users/mattcrest/dev/kando` or workspace root). Do not assume another copy (e.g. Venubase worktrees) is correct.

## Quick commands

Prefer the helper script (run from repo root):

```bash
./scripts/kando-dev.sh status
./scripts/kando-dev.sh start
./scripts/kando-dev.sh stop
./scripts/kando-dev.sh stop --force   # kill any process on 3001
./scripts/kando-dev.sh restart
```

## Workflow

### Start

1. Run `./scripts/kando-dev.sh status`.
2. If `port-in-use` with a foreign cwd, ask whether to `stop --force` or leave it.
3. If `stopped`, run `./scripts/kando-dev.sh start` in the **background** (`block_until_ms: 0` or long enough for health check).
4. Confirm `GET http://127.0.0.1:3001/api/health` returns `{"status":"ok",...}`.
5. Tell the user: **http://127.0.0.1:3001** (browser may open automatically via `npm run dev`).

### Stop

1. `./scripts/kando-dev.sh stop` (only stops if cwd is this Kando repo).
2. Use `stop --force` when another app holds port 3001 and the user wants Kando instead.

### Restart

`./scripts/kando-dev.sh restart` (add `--force` if needed).

## Defaults

| Item | Value |
|------|--------|
| URL | http://127.0.0.1:3001 |
| Port | 3001 |
| Start command | `npm run dev` → `node kando-start.js` → `electron/server.js` |
| Config | `vaults.json` (gitignored); copy from `vaults.example.json` |
| Vault path | Sibling `../venubase/venubase-web/docs/roadmap` or `VENUBASE_ROADMAP_DIR` |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot find package 'express'` | `npm install` in repo root (script does this on start) |
| Port in use, wrong cwd | `./scripts/kando-dev.sh stop --force` then `start` |
| Health never OK | Read terminal output; check `vaults.json` paths exist |

## After starting

For roadmap card work, also use the `venubase-roadmap` skill. Kando only serves the UI/API; card files live in the Venubase vault.
