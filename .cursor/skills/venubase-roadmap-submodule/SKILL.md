---
name: venubase-roadmap-submodule
description: >-
  Sync venubase-roadmap (canonical cards) with venubase-web docs/roadmap submodule.
  Use when bumping the submodule pin, cloning venubase-web, or after editing cards in
  venubase-roadmap. Full workflow also lives in venubase-web.
---

# Roadmap submodule (Venubase)

**Canonical cards:** **`venubase-roadmap`** repo — Kando’s `venubase` vault should point here.

**App pin:** `venubase-web/docs/roadmap/` submodule — same content at a pinned SHA; Kando git sync does **not** update venubase-web.

**Full checklist, bump script, and PR rules:** read

`venubase-web/.cursor/skills/venubase-roadmap-submodule/SKILL.md`

(or open venubase-web in Cursor when bumping the submodule).

**Quick rules:**

1. Edit and commit cards in **venubase-roadmap** → push **venubase-roadmap** `main`
2. PR roadmap links → `github.com/mattcrest/venubase-roadmap/blob/main/release-*.md`
3. Bump **venubase-web** submodule only when `src/docs/` relative links or collaborators need fresh cards on `main`:

```bash
cd venubase-web && ./scripts/bump-roadmap-submodule.sh && git push origin main
```
