# `roadmap.json` — storage format for Kando organization

> **Status: design note — partially implemented.** `roadmap.json` kanban columns and
> strategy horizons are live in Kando. The **card frontmatter contract in force today**
> is `release: true`, `initiative: true` / `epic: true`, and `plan_anchor` — **not**
> `kind` or `title`. Agents must fetch `GET /api/vaults/<key>/card-contract` before
> creating cards. See [docs/agent-routing.md](agent-routing.md).

**Branch:** `claude/kando-storage-format-psky48`

## Problem

Kando is a view layer over Markdown vaults it does not own. Card **content**
is already just Markdown (`release-*.md` = frontmatter + body). But card
**organization** — which column, what order, which horizon lane, how the
initiative → epic → slice graph is shaped — is smeared across three places:

1. **Which column** a card is in → the `status:` field in each card's own
   frontmatter (`server.js` `GET /api/cards`, defaults to `Backlog`).
2. **Order** within Active / Prioritized / Backlog → the wiki-link order under
   `##` headings in `roadmap-index.md` (`electron/roadmap-index.js`).
3. **Hierarchy** → an epic's parent is stored both as `initiative:` in the
   epic's frontmatter **and** as a row in the initiative's `## Epics` table,
   reconciled by `electron/initiative-epics.js`.

That spread creates two live dual-source-of-truth drift bugs: `status`
(frontmatter) can disagree with section placement (index), and an epic's
`initiative:` link can disagree with the parent's `## Epics` table.

Historically the frontmatter `status` / `roadmap_order` fields existed so
**Tolaria** saved views could read them (`syncActiveRoadmapOrder`,
`server.js:254`). Tolaria is no longer a constraint, which removes the only
reason organization had to live in frontmatter.

## Decision

Introduce a single, Kando-owned, per-vault file — **`roadmap.json`** (renamed
from the existing `kanban.json`) — that is the **source of truth for
organization**. It is **sectioned by view** and **versioned**, so new layouts
are added as new sections over time rather than as new files or schema
rewrites.

Card Markdown remains the source of truth for card **content and identity**.
Kando does not write organizational data back into card files. There is no
mirror and no sync layer.

### What lives where

| Fact | Home |
|------|------|
| Card identity (`release: true`, `kind`, `title`) | frontmatter |
| Card body / prose | Markdown body |
| Parent link (`epic:` / `initiative:` wikilink) | **frontmatter** (see edge decision) |
| Column membership + order | `roadmap.json` → `kanban` |
| Horizon lanes / strategy placement | `roadmap.json` → `strategy` |
| Ordering of epics within an initiative, slices within an epic | `roadmap.json` |
| Vault identity (`name`, `color`) | `roadmap.json` shared block |

Post-migration a card frontmatter shrinks to what is intrinsically true about
the card regardless of any board:

```yaml
---
release: true
kind: slice            # initiative | epic | slice
title: Foo bar
epic: '[[release-epic-baz]]'   # parent link only; see edge decision
---
Body markdown…
```

The following move **out** of frontmatter into `roadmap.json`: `status`,
`roadmap_order`, `horizon`, `milestone`.

## Edge decision: parent link stays in frontmatter

The initiative → epic → slice **relationships** stay as `epic:` / `initiative:`
wikilinks in frontmatter, so the vault remains human-navigable as plain
Markdown (Obsidian, GitHub) without Kando rendering it. `roadmap.json` owns the
*ordering and placement*, not the edges.

Consequence to avoid re-introducing drift: the initiative's `## Epics` table
**stops being a source**. The frontmatter link is the only home for the edge.
If the table is kept at all, Kando **generates it for humans and never reads it
back**.

## Schema sketch

```json
{
  "version": 1,
  "vault": { "name": "Venubase", "color": "#5b5bd6" },
  "kanban": {
    "columns": [
      { "key": "Active",      "label": "Active Queue", "cards": ["release-foo", "release-bar"] },
      { "key": "Prioritized", "label": "Prioritized",  "cards": ["release-baz"] },
      { "key": "Backlog",     "label": "Backlog",      "cards": ["release-qux"] }
    ]
  },
  "strategy": {
    "horizons": [
      { "key": "Now",  "initiatives": ["initiative-x"] },
      { "key": "Next", "initiatives": ["initiative-y"] }
    ]
  }
}
```

Future views (timeline, swimlanes, calendar…) are added as new top-level
sections beside `kanban` and `strategy`.

## Guardrails

1. **Single source of truth, no mirrors.** `roadmap.json` owns all
   organization: membership, order, lanes, and (ordering of) hierarchy. Kando
   never writes organizational data back into card files.
2. **Card = identity + content only.** `release: true`, `kind`, `title`, parent
   link, body. If a field describes *where the card sits* rather than *what it
   is*, it belongs in `roadmap.json`.
3. **Versioned from day one.** Top-level `version` int; the loader migrates old
   files forward.
4. **Sectioned by view, additive, forward-compatible.** `kanban`, `strategy`,
   and future sections are independent keys. Older code **ignores unknown
   sections, never drops them** on rewrite.
5. **Vault identity lives in a shared block**, outside the view sections.
6. **The file set and `roadmap.json` reconcile on load — neither silently
   wins.** Card id = filename. A card file referenced by no section is
   *unplaced* (surface it in an inbox bucket, never lose it). An id in
   `roadmap.json` with no file is *dangling* (surface it, never crash).
7. **Merge-friendly on disk.** One array item per line, stable key ordering. A
   reorder produces a small diff scoped to the one column/section that changed.

## Migration sequencing (additive, reversible)

1. **Add alongside.** Write `roadmap.json` derived from today's frontmatter +
   `roadmap-index.md`, leaving all Markdown untouched.
2. **Parity check.** Derive columns/order both ways (old: frontmatter+index;
   new: `roadmap.json`) and assert identical. Ship the reader flip only when
   parity holds.
3. **Strip redundant fields.** In a separate change, remove now-unused
   `status` / `roadmap_order` / `horizon` / `milestone` from frontmatter and
   retire `syncActiveRoadmapOrder` and the `## Epics` table read path.

## Escape hatch (pre-planned)

If `roadmap.json` becomes a merge-conflict magnet in real multi-branch use,
split each section (or each column) into its own file. Because the schema is
sectioned from day one (guardrail 4), this needs no rewrite — the minimal
single-file build is a strict subset of the split-file build.

## Open questions

- Adoption path for a new card dropped into the vault by an agent: which
  default column, and how `docs/agent-routing.md` describes the second (place)
  step.
- Whether `kind` fully replaces the current `initiative: true` / `epic: true`
  frontmatter markers, or coexists during migration.
