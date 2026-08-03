---
name: kando-atlas-maintain
description: >-
  Keep product-atlas.json and cardMapping aligned with roadmap slices. Use when editing
  release cards that touch product areas, adding entities or relations, or fixing Atlas
  API warnings about unknown card or entity ids.
---

# Kando Atlas maintain

Keep the vault's **`product-atlas.json`** honest as the product and roadmap evolve.

## Prerequisites

1. **kando-roadmap-router** — resolve `vaultPath`.
2. Read existing `product-atlas.json` before editing.
3. Schema reference: `templates/atlas/README.md` or `.kando/atlas/README.md`.

## When to update

| Event | Action |
|-------|--------|
| You create or ship a **slice** | Add/update `cardMapping[card-id]` → entity ids it touches |
| Slice changes product scope | Adjust entity list in mapping; add relations if needed |
| New stable product noun | Add `entity`, place in `domain`, wire `relations` |
| Feature is purely internal / no product noun | Omit from map — Atlas is product-facing |
| Slice deleted or renamed | Remove or rename `cardMapping` key |

**Map slices, not epics** — unless an epic is a forecast before slices exist.

## cardMapping examples

```json
"cardMapping": {
  "release-contacts-multi-role": ["contact", "crm-profile"],
  "release-checkout-refunds": ["order", "payment"]
}
```

Entity mapping is usually less ambiguous than journey "moments": ask *what product objects does this PR change?*

## After every edit

```bash
curl -s "http://127.0.0.1:3001/api/atlas?vault=<vaultKey>"
```

Resolve all `warnings`. Unknown card id → wrong key or card not `release: true`. Unknown entity id → typo in mapping.

Optional doctor check (stale agent fields are separate warnings):

```bash
curl -s "http://127.0.0.1:3001/api/vaults/<vaultKey>/doctor"
```

## Size discipline

- Prefer **25–50 entities** — merge or drop low-value nodes before the map sprawls.
- Use `channel` / `job` kinds for notifications and cron so they appear on the map.
- Do not add x/y coordinates.

## Commit in vault repo

```bash
cd "<vaultPath>"
git add product-atlas.json
git commit -m "roadmap: update atlas mapping for <slice-or-domain>"
```

If you also edited slice markdown, include those files in the same commit when appropriate.

## Related skills

- **kando-atlas-setup** — first-time scaffold
- **kando-roadmap-router** — vault + conventions
- **release-card-writing** — slice bodies
