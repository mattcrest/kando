---
name: kando-atlas-setup
description: >-
  Scaffold or bootstrap product-atlas.json (v2 entity mind-map) for a Kando roadmap
  vault. Use when starting Atlas for a new project, the user wants a product domain map,
  or the Atlas tab is missing because no product-atlas.json exists.
---

# Kando Atlas setup

Create an optional **entity mind-map** so Kando's Atlas view shows domain clusters,
relations, and roadmap weather on product nouns.

**Canonical schema:** Kando repo `templates/atlas/README.md` (or `.kando/atlas/README.md` after pack sync).

## Prerequisites

1. **kando-roadmap-router** — resolve `vaultPath` and conventions.
2. **kando-dev-server** — start Kando if you need live API validation.

## When Atlas is missing

Kando hides the Atlas tab when `<vaultPath>/product-atlas.json` does not exist. Creating the file enables the view after vault reload.

## Interview first (required)

Before authoring entities, ask:

- What are the **stable product nouns** (things that persist: Contact, Order, Venue)?
- What **domains** group those nouns (Commerce, CRM, Platform, Comms)?
- What **notifications and jobs** exist (email receipts, weekly digests, cron)?
- Which **existing slices** clearly touch each noun?

If the user is stuck, skim `roadmap-index.md` and epic titles for domain hints — do not dump a full map before they confirm direction.

## Bootstrap file

### Generic project

```bash
cp "<kando>/templates/atlas/product-atlas.example.json" \
   "<vaultPath>/product-atlas.json"
```

Or from a synced app repo: `.kando/atlas/product-atlas.example.json`.

### Venubase

```bash
cp "<kando>/templates/atlas/product-atlas.venubase.json" \
   "<vaultPath>/product-atlas.json"
```

## Authoring rules (v2)

```json
{
  "version": 2,
  "title": "My Product",
  "domains": [{ "id": "commerce", "label": "Commerce" }],
  "entities": [
    { "id": "order", "label": "Order", "domain": "commerce", "kind": "core", "description": "..." }
  ],
  "relations": [
    { "from": "order", "to": "payment", "kind": "flows-into" }
  ],
  "cardMapping": {
    "release-checkout-refunds": ["order", "payment"]
  }
}
```

| Rule | Detail |
|------|--------|
| Entity kinds | `core`, `supporting`, `channel`, `job` |
| Relation kinds | `owns`, `references`, `flows-into`, `notifies` |
| No coordinates | Never add x/y — layout is computed |
| Size | Target **25–50 entities**; fewer is fine for v1 |
| cardMapping | Slice id → array of **entity ids** (not moments, not epic ids unless intentional) |

Map **slices** (`release-*.md` without `epic: true`). Epics can carry mapping only as forecasts before slicing.

## Validate

```bash
curl -s "http://127.0.0.1:3001/api/atlas?vault=<vaultKey>"
```

- `warnings` with unknown card ids → fix `cardMapping` keys or create missing cards.
- `warnings` with unknown entity ids → fix entity ids in mapping.
- Open Kando → Atlas tab → confirm clusters and weather rail populate.

## Commit

```bash
cd "<vaultPath>"
git add product-atlas.json
git commit -m "roadmap: add product atlas v2 entity map"
git push origin main
```

## Related skills

- **kando-atlas-maintain** — keep map and `cardMapping` current as slices ship
- **kando-roadmap-router** — vault resolution
- **release-card-writing** — slice content while you map entities
