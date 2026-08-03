# Product Atlas (optional)

Kando's **Atlas** view is an interactive **entity mind-map**: product nouns grouped by domain, with roadmap cards linked so humans can trace what in-flight work touches.

Atlas is **optional**. Vaults without `product-atlas.json` simply hide the Atlas tab.

## Quick start (new project)

1. Copy the example schema into your vault root:

   ```bash
   cp /path/to/kando/templates/atlas/product-atlas.example.json \
      /path/to/your-roadmap-vault/product-atlas.json
   ```

2. Edit `title`, `domains`, `entities`, `relations`, and `cardMapping` for your product.
3. Restart Kando or reload the vault — the **Atlas** tab appears.
4. Validate the join:

   ```bash
   curl -s "http://127.0.0.1:3001/api/atlas?vault=<vaultKey>"
   ```

   Fix any `warnings` (unknown card ids or entity ids).

**Venubase:** use [`product-atlas.venubase.json`](product-atlas.venubase.json) as the starting point instead of the generic example.

## Schema v2 (`product-atlas.json`)

| Field | Purpose |
|-------|---------|
| `version` | Must be `2` |
| `title` | Map title in the Atlas toolbar |
| `domains` | `[{ id, label }]` — cluster labels on the map |
| `entities` | `[{ id, label, domain, kind, description? }]` |
| `relations` | `[{ from, to, kind }]` — entity id → entity id |
| `cardMapping` | `{ "<card-id>": ["entity-id", ...] }` |

### Entity `kind`

| Kind | Use for |
|------|---------|
| `core` | Primary product objects (Contact, Order, Visit) |
| `supporting` | Secondary objects tied to a core noun |
| `channel` | Outbound notifications (email, SMS) |
| `job` | Scheduled / background work |

### Relation `kind`

| Kind | Meaning |
|------|---------|
| `owns` | Parent contains child (venue owns site content) |
| `references` | Soft link / lookup |
| `flows-into` | Data or process moves toward |
| `notifies` | Triggers a channel entity |

### Layout rules

- **No x/y coordinates** — layout is computed from domains and relations (keeps git diffs clean).
- **Size discipline:** aim for **25–50 entities**; split or simplify if the map sprawls.
- **cardMapping** keys must match slice filenames without `.md` (e.g. `release-checkout-refunds`).

### When to update

- **New slice** that changes a product area → add or extend `cardMapping` for that card id.
- **New product noun** → add `entity`, wire `relations`, map relevant cards.
- **Shipped slice** → mapping can stay (shows settled weather) or remove if the entity was exploratory.

Agents: use the **kando-atlas-setup** and **kando-atlas-maintain** skills.

## API

```bash
GET /api/atlas?vault=<key>
```

Returns `{ atlas, entityCards, warnings? }`. `entityCards` maps each entity id to joined roadmap cards (`id`, `title`, `status`, `agent_status`).

Dev fixture (ignores vault atlas file):

```bash
GET /api/atlas?vault=<key>&fixture=1
```

## Reference templates (Kando repo)

| File | Purpose |
|------|---------|
| `templates/atlas/product-atlas.example.json` | Small generic fixture |
| `templates/atlas/product-atlas.venubase.json` | Full Venubase seed |

After `sync-agent-pack.sh`, copies live under `.kando/atlas/` in synced repos.
