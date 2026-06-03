---
name: kando-roadmap-router
description: >-
  Resolves the current workspace to a Kando roadmap vault via Kando routing config,
  then applies that vault's release-card conventions. Use when the user mentions a
  Kando card, roadmap card, release card, release-*.md, or roadmap work in any app repo.
---

# Kando roadmap router

**Canonical spec (all agents):** [docs/agent-routing.md](../../docs/agent-routing.md) in the Kando repo.

Routing is owned by **Kando** (`vaults.json` → `routing`), not this skill. This Cursor skill is a thin wrapper around that spec.

## Step 1 — Resolve workspace → vault

1. Determine workspace root (from user_info, cwd, or git root).
2. Prefer Kando API (start Kando if needed — see **kando-dev-server** skill):

```bash
curl -s "http://127.0.0.1:3001/api/routing/resolve?workspaceRoot=/absolute/path/to/repo"
```

3. If `matched: true`, use `vaultKey`, `vaultPath`, `conventionsPath`, `indexPath`, and `canonicalRepo`.
4. If `matched: false`, read Kando `vaults.json` (or ask user) and add `routing.<vaultKey>.workspaceRoots` — do not guess vault paths.

Fallback if Kando is down: read `vaults.json` in the Kando install directory and match `routing.*.workspaceRoots` manually (`*` glob or directory prefix match).

## Step 2 — Load project conventions

Read the resolved vault's:

- `conventionsPath` (usually `roadmap-conventions.md`)
- `indexPath` (usually `roadmap-index.md`)

Follow **that project's** status lifecycle and body sections exactly (each vault may differ).

## Step 3 — Card work

1. Find `release-<slug>.md` under `vaultPath` (grep or read `roadmap-index.md`).
2. Edit card frontmatter and body per conventions.
3. Commit in the vault git repo when appropriate (path is the vault directory, not always the app repo).

```bash
cd "<vaultPath>"
git status -sb
git add -A && git commit -m "roadmap: <description>"
git push origin main
```

## PR links

When `canonicalRepo` is set, prefer:

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

Restart Kando after edits. No changes to this skill are required.

## Related skills (shipped with Kando)

- **kando-dev-server** — start/stop Kando on port 3001
- **venubase-roadmap** — Venubase-specific card + submodule notes (optional)
