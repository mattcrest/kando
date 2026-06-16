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

## Find a card

```bash
grep -r "search term" /path/to/venubase-roadmap/
grep -l "status: Active" /path/to/venubase-roadmap/release-*.md
```

Hub: `roadmap-index.md`. Conventions: `roadmap-conventions.md`.

## Frontmatter (Kando kanban)

| Field | Values |
|-------|--------|
| `status` | `Backlog`, `Prioritized`, `Active`, `Blocked`, `Done` (Shipped column) |
| `roadmap_order` | Number while Active/Prioritized; omit when Done |
| `shipped_at` | ISO date when Done |
| `release` | `true` for release pipeline cards |

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
roadmap_order: 40
related_to: "[[venubase]]"
plan_anchor: Short title
shipped_at: null
---

# Short title

## Summary
One paragraph.

## Acceptance criteria
- [ ] Testable item

## PRs
- TBD
```
