---
name: venubase-roadmap
description: >-
  Search and update Venubase roadmap release cards (release-*.md). Use when planning,
  starting, progressing, or shipping a feature slice, or when the user asks about
  roadmap cards. Git/submodule steps: venubase-roadmap-submodule skill.
---

# Venubase roadmap cards

## Where files live

**Edit here (canonical path):** `venubase-web/docs/roadmap/` — git submodule → **`mattcrest/venubase-roadmap`**.

Point Kando’s venubase vault at that directory. Do not maintain a second stale clone elsewhere.

After card edits: commit **inside** `docs/roadmap` and push **venubase-roadmap**. Bump **venubase-web** only when PRs/docs need the pin — see **venubase-roadmap-submodule** skill (full copy in venubase-web).

## Find a card

```bash
grep -r "search term" /path/to/venubase-web/docs/roadmap/
grep -l "status: Active" /path/to/venubase-web/docs/roadmap/release-*.md
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

1. **Find** matching `release-<slug>.md`
2. **Update** status, acceptance criteria, PR links, blockers
3. **Commit** inside submodule:

```bash
cd /path/to/venubase-web/docs/roadmap
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

## Card template (minimal)

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
- (pending)
```
