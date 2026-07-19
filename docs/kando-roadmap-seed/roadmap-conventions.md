# Kando roadmap — conventions

This vault dogfoods Kando's own `roadmap.json` storage format. See the design
note at [`kando/docs/roadmap-json.md`](https://github.com/mattcrest/kando/blob/main/docs/roadmap-json.md).

## Cards
- One `release-*.md` (slice), `release-epic-*.md` (epic), or `initiative-*.md`
  (initiative) per card. Frontmatter carries `release: true`, `kind`, `title`,
  and the parent link (`epic:` / `initiative:` wikilink) only.
- Organization (column, order, horizon lanes) lives in `roadmap.json`, not in
  frontmatter.

## Organization
- `roadmap.json` is the source of truth. `kanban.columns[].cards` defines column
  membership and order; `strategy.horizons[]` defines Now/Next/Later placement.
- A card file referenced by no section is *unplaced* (surfaced, not lost).
