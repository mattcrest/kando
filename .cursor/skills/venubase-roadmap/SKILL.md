---
name: venubase-roadmap
description: >-
  Venubase-specific roadmap paths and conventions. Use when planning Venubase features
  or editing Venubase roadmap cards. Generic card rules: kando-roadmap-router and
  .kando/kando-for-agents.md. Submodule bumps: venubase-roadmap-submodule skill.
---

# Venubase roadmap (project overlay)

**Start with kando-roadmap-router** for vault resolution and generic card rules. Read **`.kando/kando-for-agents.md`** (or Kando's `docs/agent-routing.md`) for Board / Strategy / Atlas / Workbench, hierarchy, queue order, and Workbench fields.

Use this skill only for **Venubase-specific** paths and frontmatter.

## Where files live

**Canonical edit path (Kando vault):** standalone **`venubase-roadmap`** repo — e.g. `~/dev/venubase-roadmap/`.

Point Kando's `venubase` vault there. Card commits and Kando **Commit & Push** go to **`mattcrest/venubase-roadmap`** on `main`.

**Product Atlas:** `product-atlas.json` (v2 entity map) lives at the vault root. Seed from Kando `templates/atlas/product-atlas.venubase.json`. Maintain `cardMapping` when slices touch product areas — **kando-atlas-maintain**.

**App repo pin:** `venubase-web/docs/roadmap/` is a git submodule of the same repo. Do not use it as the Kando vault path unless you have no standalone clone. Bump the submodule in venubase-web only when needed — see **venubase-roadmap-submodule**.

## Venubase-specific frontmatter

| Field | Values |
|-------|--------|
| `related_to` | `"[[venubase]]"` on most cards |
| `milestone` | Initiatives only: `venue-2`, `cohort-2-4`, `scale-10` |
| `category` | Kanban tag — Admin, Checkout, Account, POS, etc. |

## PR link (prefer roadmap repo)

In venubase-web PR bodies:

```markdown
## Roadmap
https://github.com/mattcrest/venubase-roadmap/blob/main/release-<slug>.md
```

No venubase-web submodule bump required for PR links alone.

## Related skills

- **kando-roadmap-router** — resolve vault + generic conventions
- **release-card-writing** — readable card bodies
- **kando-atlas-setup** — scaffold Venubase `product-atlas.json` from template
- **kando-atlas-maintain** — keep Atlas entities and `cardMapping` current
- **venubase-roadmap-submodule** — bump `docs/roadmap` submodule pin in venubase-web
