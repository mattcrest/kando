---
name: kando-roadmap-router
description: >-
  Resolves the current workspace to a Kando roadmap vault via Kando routing config,
  then applies that vault's release-card conventions. Use when the user mentions a
  Kando card, roadmap card, release card, release-*.md, or roadmap work in any app repo.
---

# Kando roadmap router

**Canonical spec (all agents):** [docs/agent-routing.md](../../docs/agent-routing.md) in the Kando repo.

Routing is owned by **Kando** (`vaults.json` → `routing`) when running locally, or by the vendored **agent pack** (`.kando/` + `kando.agent.json`) in app/vault repos when offline or in cloud agents.

## Step 1 — Resolve workspace → vault

1. Determine workspace root (from user_info, cwd, or git root).

### A. Kando API (preferred when available)

```bash
curl -s "http://127.0.0.1:3001/api/routing/resolve?workspaceRoot=/absolute/path/to/repo"
```

When `matched: true`, use `vaultKey`, `vaultPath`, `conventionsPath`, `indexPath`, `canonicalRepo`, and `cardContractPath`.

### B. Offline / cloud (vendored pack)

If the workspace has `.kando/` and `kando.agent.json` (installed via `sync-agent-pack.sh`):

1. Read `kando.agent.json` at the workspace root.
2. Try each `vaultPathHints` path relative to the workspace until one exists and contains the conventions file.
3. Use `.kando/card-contract.json` and `.kando/kando-for-agents.md`.

### C. Last resort

If Kando is down and no pack is present: read `vaults.json` in the Kando install directory and match `routing.*.workspaceRoots` manually (`*` glob or directory prefix match), or ask the user — do not guess vault paths.

## Step 2 — Load project conventions

Read the resolved vault's:

- `conventionsPath` (usually `roadmap-conventions.md`)
- `indexPath` (usually `roadmap-index.md`) — **source of truth for queue order** in Kando (Active, Prioritized, Backlog sections)

Follow **that project's** status lifecycle and body sections exactly (each vault may differ).

### Queue order

Kando sorts **Active**, **Prioritized**, and **Backlog** columns by card order in `roadmap-index.md` (wiki links under each `##` section). Drag-reorder in the UI rewrites the index file.

- **Do not** manually maintain `roadmap_order` on every card for Kando display.
- **`roadmap_order`** on Active cards is auto-synced from index position for Tolaria's Active saved view (optional legacy field).
- When adding or reprioritizing cards, update **`roadmap-index.md`** (or drag in Kando).

## Step 3 — Card work

1. Fetch the card contract: live API `cardContractPath` or `.kando/card-contract.json`.
2. Find `release-<slug>.md` under `vaultPath` (grep or read `roadmap-index.md`).
3. Edit card frontmatter and body per conventions.
4. When **creating or rewriting** card body copy, follow **release-card-writing** for product-builder readability in Kando.
5. Commit in the vault git repo when appropriate (path is the vault directory, not always the app repo).

```bash
cd "<vaultPath>"
git status -sb
git add -A && git commit -m "roadmap: <description>"
git push origin main
```

## PR links

When `canonicalRepo` is set:

```markdown
## Roadmap
https://github.com/<canonicalRepo>/blob/main/release-<slug>.md
```

## Register a new project

Add to Kando `vaults.json`:

1. `vaults.<key>` — absolute path to roadmap markdown root
2. `routing.<key>.workspaceRoots` — app repo roots (and worktree globs)
3. `routing.<key>.conventionsFile` / `indexFile` — defaults: `roadmap-conventions.md`, `roadmap-index.md`
4. Optional `routing.<key>.canonicalRepo`
5. Run `./scripts/sync-agent-pack.sh --app-repo <path>` to vendor the agent pack

Restart Kando after edits. No changes to this skill are required.

## Related skills (shipped with Kando)

- **kando-dev-server** — start/stop Kando on port 3001
- **release-card-writing** — readable card bodies + validation gate
- **kando-strategy-setup** — interview user and scaffold Strategy initiatives
- **kando-atlas-setup** — scaffold `product-atlas.json` for Atlas
- **kando-atlas-maintain** — keep Atlas `cardMapping` aligned with slices
- **venubase-roadmap** — Venubase-specific paths only (Kando repo / Venubase workspaces)
