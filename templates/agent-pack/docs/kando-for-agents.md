# Kando for agents

Cold-start guide for coding agents working with a Kando roadmap — including **Cursor Cloud** and **Claude Code cloud** when Kando is not running locally.

## What Kando is

Kando is a local kanban UI + HTTP API over Markdown roadmap cards in Tolaria-style vaults. Humans use four views (Atlas is optional):

| View | Purpose |
|------|---------|
| **Board** | Kanban columns (Backlog → Prioritized → Active → Shipped). Epics and slices appear here by `status`. |
| **Strategy** | Now / Next / Later horizons for **initiatives** — big bets that group epics. |
| **Atlas** | Optional **entity mind-map** (`product-atlas.json`) — domain clusters, relations, roadmap weather; select a card to trace what it touches. |
| **Workbench** | What agents are working on now (`agent_*` fields on slices) plus ranked "up next" suggestions (`agent-suggestions.md`). |

You edit cards as Markdown files in the **vault** (a git repo). The vault may be a sibling repo, a submodule inside the app repo (e.g. `docs/roadmap/`), or a folder — see `kando.agent.json` in the app repo.

## Card hierarchy (three layers)

| Layer | Files | Marker | Parent link | Hub |
|-------|-------|--------|-------------|-----|
| **Initiative** (strategy bet) | `initiative-*.md` | `initiative: true` + `horizon: Now\|Next\|Later` | — | `strategy-index.md` or `roadmap.json` |
| **Epic** (execution theme) | `release-epic-*.md` | `epic: true` | `initiative: '[[initiative-<slug>]]'` | `roadmap-index.md` |
| **Story slice** (one PR) | `release-*.md` | neither flag | `epic: '[[release-epic-<slug>]]'` | epic's Story slices table |

**Altitude guide:**

| Too big (initiative) | Too small | Right size |
|----------------------|-----------|------------|
| "The whole product" | One bug or one screen | A bet a non-engineer can name; needs several themes of work and many small deliverables |

- Prioritize **initiatives** in Strategy (`strategy-index.md` or `roadmap.json`).
- Prioritize **epics** in `roadmap-index.md` — never queue-sort individual slices in the index.
- New slices must set `epic:`; new epics must set `initiative:`.
- Kando's Strategy view, breadcrumbs, and progress roll-ups derive from these links.

**Never use** `kind` or `title` frontmatter — use `initiative: true` / `epic: true` and `plan_anchor` instead. See `.kando/card-contract.json`.

## Resolve the vault

Try in order:

### 1. Kando API (local, preferred)

```bash
curl -s "http://127.0.0.1:3001/api/routing/resolve?workspaceRoot=/absolute/path/to/workspace"
```

When `matched: true`, use `vaultPath`, `conventionsPath`, `indexPath`, `cardContractPath`.

### 2. Vendored pack + `kando.agent.json` (cloud / offline)

Read `kando.agent.json` at the workspace root. Try each path in `vaultPathHints` relative to the workspace until one exists and contains `roadmap-conventions.md` (or your `conventionsFile`).

```json
{
  "vaultKey": "myproject",
  "vaultPathHints": ["docs/roadmap", "../myproject-roadmap"],
  "canonicalRepo": "org/myproject-roadmap",
  "conventionsFile": "roadmap-conventions.md",
  "indexFile": "roadmap-index.md"
}
```

Then read:

- `<vaultPath>/<conventionsFile>` — project-specific rules (status values, sections)
- `<vaultPath>/<indexFile>` — queue order for Board columns
- `.kando/card-contract.json` — generic write contract
- `.kando/templates/{initiative,epic,slice}.md` — scaffolds for new cards

### 3. Ask the user

If neither works, do not guess vault paths.

## Queue order (Board)

**`roadmap-index.md` is the source of truth** for order within Active, Prioritized, and Backlog. Kando reads wiki-link order under each `##` section; drag-reorder in the UI updates the index file.

| Field | Role |
|-------|------|
| `status` | Column membership (`Backlog`, `Prioritized`, `Active`, `Blocked`, `Done`) |
| `roadmap_order` | Optional — auto-synced from index for **Active** cards; omit on new cards |
| `shipped_at` | ISO date when Done |

When reprioritizing: edit the list under the right `##` section in `roadmap-index.md`, or drag in Kando. Do not hand-edit `roadmap_order` across many files.

## Frontmatter essentials

| Field | Values / notes |
|-------|----------------|
| `release` | `true` for all Kando cards (initiatives, epics, slices) |
| `plan_anchor` | Short human title (not `title`) |
| `status` | `Backlog`, `Prioritized`, `Active`, `Blocked`, `Done`, `Deferred` |
| `initiative` | `true` on initiative cards; `'[[initiative-<slug>]]'` wikilink on epics |
| `epic` | `true` on epic cards; `'[[release-epic-<slug>]]'` wikilink on slices |
| `horizon` | Initiatives only: `Now`, `Next`, `Later` |

Project-specific fields (`category`, `milestone`, `related_to`, etc.) — follow that vault's `roadmap-conventions.md` and copy existing cards.

## Workbench: keep progress current

Update these on **every slice you touch** — Kando's Workbench surfaces them to the human:

```yaml
agent_status: in_progress   # in_progress | blocked | needs_review | idle
agent_provider: cursor      # cursor | claude | codex | manual
agent_summary: "Wired the discount modal; validating edge cases."
agent_next: "Add server-side validation, then update acceptance criteria."
agent_updated_at: 2026-07-25T14:32:00Z
```

## Suggesting what to work on next

Write ranked suggestions to `agent-suggestions.md` in the vault root (not just chat):

```markdown
---
generated_at: 2026-07-25T14:00:00Z
generated_by: claude
context: "Focus on 2 epics at once. Prioritize POS launch blockers."
---

## Suggested next slices

1. [[release-foo-slug]] — Unblocks launch; no open dependencies.
2. [[release-bar-slug]] — Small, isolated; finishes Admin epic.
```

Overwrite each time; it's a snapshot.

## Atlas (optional product map)

Vaults may include **`product-atlas.json`** at the vault root (schema v2). When present, Kando shows the **Atlas** tab: entities grouped by domain, relation edges, and a weather rail of in-flight cards. Selecting a card highlights every entity it touches.

| Field | Purpose |
|-------|---------|
| `domains` | Cluster labels |
| `entities` | Product nouns (`kind`: `core`, `supporting`, `channel`, `job`) |
| `relations` | Entity graph (`owns`, `references`, `flows-into`, `notifies`) |
| `cardMapping` | `{ "<slice-id>": ["entity-id", ...] }` |

**Bootstrap:** copy `.kando/atlas/product-atlas.example.json` → `<vaultPath>/product-atlas.json` and edit. Full reference: `.kando/atlas/README.md`.

**Validate:**

```bash
curl -s "http://127.0.0.1:3001/api/atlas?vault=<vaultKey>"
```

Fix `warnings` before committing. When you edit slices that change product areas, update `cardMapping` — see **kando-atlas-maintain**.

## Validate before you finish

**When Kando is running:**

```bash
curl -s "http://127.0.0.1:3001/api/vaults/<vaultKey>/card-contract"
curl -s -X POST "http://127.0.0.1:3001/api/cards/validate?vault=<key>" \
  -H 'Content-Type: application/json' \
  -d '{"cardId": "release-example-slug"}'
curl -s "http://127.0.0.1:3001/api/vaults/<vaultKey>/doctor"
```

**Offline:** read `.kando/card-contract.json`, `roadmap-conventions.md`, and copy frontmatter from an existing card in the vault verbatim.

## PR links

When `canonicalRepo` is set in `kando.agent.json` or the resolve response:

```markdown
## Roadmap
https://github.com/<canonicalRepo>/blob/main/release-<slug>.md
```

## Commit workflow

Commit inside the **vault** git repository (`vaultPath`), which may differ from the app repo:

```bash
cd "<vaultPath>"
git add -A && git commit -m "roadmap: <what changed>"
git push origin main
```

## Pack skills in this repo

| Skill | Use when |
|-------|----------|
| **kando-roadmap-router** | Resolve vault; follow conventions |
| **release-card-writing** | Draft readable card bodies |
| **kando-strategy-setup** | Scaffold Now/Next/Later initiatives |
| **kando-atlas-setup** | Scaffold `product-atlas.json` for Atlas |
| **kando-atlas-maintain** | Keep Atlas entities and `cardMapping` current |
