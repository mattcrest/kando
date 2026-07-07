---
name: venubase-roadmap
description: >-
  Search and update Venubase roadmap release cards (release-*.md). Use when planning,
  starting, progressing, or shipping a feature slice, or when the user asks about
  Venubase roadmap cards. Git/submodule steps: venubase-roadmap-submodule skill.
---

# Venubase roadmap cards

**Start with kando-roadmap-router** to resolve the vault from the active workspace. Use this skill for Venubase-specific paths and submodule workflow.

**When creating or rewriting card body copy**, also follow **release-card-writing** so cards scan well in the Kando modal for a product builder.

## Where files live

**Canonical edit path (Kando vault):** standalone **`venubase-roadmap`** repo — e.g. `~/dev/venubase-roadmap/`.

Point Kando’s `venubase` vault there. Card commits and Kando **Commit & Push** go to **`mattcrest/venubase-roadmap`** on `main`.

**App repo pin:** `venubase-web/docs/roadmap/` is a git submodule of the same repo. Do not use it as the Kando vault path unless you have no standalone clone. Bump the submodule in venubase-web only when needed — see **venubase-roadmap-submodule**.

## Three layers

| Layer | Files | Marker | Parent link | Hub |
|-------|-------|--------|-------------|-----|
| **Initiative** (strategy bet) | `initiative-*.md` | `initiative: true` + `horizon: Now\|Next\|Later`, optional `milestone:` | — | `strategy-index.md` |
| **Epic** (execution theme) | `release-epic-*.md` | `epic: true` | `initiative: '[[initiative-<slug>]]'` | `roadmap-index.md` |
| **Story slice** (one PR) | `release-*.md` | neither flag | `epic: '[[release-epic-<slug>]]'` | epic's Story slices table |

Prioritize **initiatives** in `strategy-index.md`, **epics** in `roadmap-index.md`. Never queue-sort individual slices. New slices must set `epic:`; new epics must set `initiative:`. Kando's Strategy view, breadcrumbs, and progress roll-ups all derive from these links.

## Find a card

```bash
grep -r "search term" /path/to/venubase-roadmap/
grep -l "status: Active" /path/to/venubase-roadmap/release-*.md
```

Hubs: `strategy-index.md` (initiatives) · `roadmap-index.md` (epics + slice appendix). Conventions: `roadmap-conventions.md`.

## Queue order (Kando kanban)

**`roadmap-index.md` is the source of truth** for order within Active, Prioritized, and Backlog. Kando reads wiki-link order under each section header; drag-reorder in the UI updates the index file.

| Field | Role |
|-------|------|
| `status` | Column membership (`Backlog`, `Prioritized`, `Active`, `Blocked`, `Done`) |
| `roadmap_order` | Optional — auto-synced from index for **Active** cards (Tolaria view); omit on new cards |
| `shipped_at` | ISO date when Done |

When reprioritizing: edit the numbered/bullet list under the right `##` section in `roadmap-index.md`, or drag in Kando. Do not hand-edit `roadmap_order` across many files.

## Frontmatter (Kando kanban)

| Field | Values |
|-------|--------|
| `status` | `Backlog`, `Prioritized`, `Active`, `Blocked`, `Done` (Shipped column), `Deferred` |
| `roadmap_order` | Omit for new cards; Kando derives for Active from index when needed |
| `shipped_at` | ISO date when Done |
| `release` | `true` for all Kando cards (initiatives, epics, slices) |
| `initiative` | `true` on initiative cards; `'[[initiative-<slug>]]'` wikilink on epics |
| `epic` | `true` on epic cards; `'[[release-epic-<slug>]]'` wikilink on slices |
| `horizon` / `milestone` | Initiatives only: `Now\|Next\|Later`; `venue-2\|cohort-2-4\|scale-10` |

Kanban columns: Backlog → Prioritized → Active → Shipped (`Done` in frontmatter).

## Workflow

1. **Find** matching `release-<slug>.md` in **venubase-roadmap**
2. **Update** status, acceptance criteria, PR links, blockers
3. **Commit** in venubase-roadmap:

```bash
cd /path/to/venubase-roadmap
git checkout main && git pull
git add -A && git commit -m "roadmap: <what changed>"
git push origin main
```

4. **Kando:** Commit & Push in header (same repo)
5. **Shipped:** `status: Done`, `shipped_at`, ## Shipped section with PR link
6. **Notify user** with status summary (Active → Done, blockers, next step)

## PR link (prefer roadmap repo)

In venubase-web PR bodies:

```markdown
## Roadmap
https://github.com/mattcrest/venubase-roadmap/blob/main/release-<slug>.md
```

No venubase-web submodule bump required for PR links alone.

## Writing readable cards

Agents: follow **release-card-writing** (Kando skill) when drafting or rewriting card bodies.

Quick rules for human readers in Kando:

- **Summary** — outcome in plain language first; no code or table names.
- **Problem / context** — two sentences max (pain + risk).
- **Product outcome** — bullets, observable behavior, not implementation.
- **Acceptance criteria** — testable outcomes; keep in one `## Acceptance criteria` section with `- [ ]` items (Kando renders these as a checklist in the modal).
- Put repo paths and migrations in **Technical references**, not Summary.

## Card template (minimal)

See **release-card-writing** for the full PRD-style template. Minimal stub:

```markdown
---
type: Note
release: true
status: Active
related_to: "[[venubase]]"
plan_anchor: Short title
shipped_at: null
---

# Short title

List under the matching section in `roadmap-index.md`.

## Summary
One paragraph.

## Acceptance criteria
- [ ] Testable item

## PRs
- TBD
```
