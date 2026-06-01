---
name: venubase-roadmap-submodule
description: >-
  Submodule sync between venubase-roadmap and venubase-web. Use when bumping
  docs/roadmap, cloning venubase-web, or submodule best practices. Full workflow
  lives in venubase-web; this skill is a pointer for Kando-only sessions.
---

# Roadmap submodule (Kando)

Kando edits **`venubase-roadmap`** via the vault at `venubase-web/docs/roadmap/`. Kando git sync does **not** update the parent repo.

**Full checklist, bump script, and PR rules:** read

`venubase-web/.cursor/skills/venubase-roadmap-submodule/SKILL.md`

(or open venubase-web in Cursor when bumping the submodule).

**Quick rules:**

1. Commit card changes inside `docs/roadmap` → push **venubase-roadmap**
2. PR roadmap links → `github.com/mattcrest/venubase-roadmap/blob/main/release-*.md`
3. Bump **venubase-web** only when `src/docs/` relative links or collaborators need fresh cards on `main`:

```bash
cd venubase-web && ./scripts/bump-roadmap-submodule.sh && git push origin main
```
