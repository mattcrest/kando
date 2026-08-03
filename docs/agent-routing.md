# Agent routing for Kando roadmaps

This document is **agent-agnostic**. Any coding agent (Cursor, Claude Code, Codex, Windsurf, etc.) can follow it. Cursor-specific packaging lives in [`.cursor/skills/`](../.cursor/skills/) and is optional.

## What Kando provides

| Layer | Agent-agnostic? | Role |
|-------|-----------------|------|
| `vaults.json` → `routing` | Yes | Maps app repo paths to roadmap vault directories |
| HTTP API (`:3001`) | Yes | Resolves workspace → vault + convention file paths |
| Markdown vaults | Yes | `release-*.md`, `roadmap-conventions.md`, `roadmap-index.md` |
| `.cursor/skills/` | No (Cursor only) | Thin wrappers around this doc |

## Prerequisites

1. Kando installed and `vaults.json` configured (copy from `vaults.example.json`).
2. Kando server running: `npm run dev` or `./scripts/kando-dev.sh start` (default **http://127.0.0.1:3001**).

## Workflow (any agent)

### 1. Resolve the active project

Use the workspace root of the app repo the user is working in (git root or editor workspace path).

```bash
curl -s "http://127.0.0.1:3001/api/routing/resolve?workspaceRoot=/absolute/path/to/app-repo"
```

**When `matched` is `true`**, use:

| Field | Meaning |
|-------|---------|
| `vaultKey` | Kando vault id (e.g. `venubase`, `playerpath`) |
| `vaultPath` | Directory containing `release-*.md` |
| `conventionsPath` | Project-specific rules file |
| `indexPath` | Active queue / index |
| `canonicalRepo` | Optional `org/repo` for PR roadmap links |

**When `matched` is `false`**, do not guess paths. Ask the user to add `routing.<vaultKey>.workspaceRoots` in `vaults.json`, or read the hint in the JSON response.

**Fallback (API down):** Read `vaults.json` from the Kando install directory. For each `routing.<key>.workspaceRoots` entry, match the workspace path (exact prefix or `*` glob). First match wins.

### 2. Load project conventions and card contract

Read `conventionsPath` and `indexPath` from the resolve response. Status values, required card sections, and lifecycle rules **vary by project** — always follow that vault’s `roadmap-conventions.md`, not assumptions from another project.

**Card contract (required before creating cards):**

```bash
curl -s "http://127.0.0.1:3001/api/vaults/<vaultKey>/card-contract"
```

The resolve response includes `cardContractPath`. Write only fields the contract names (`release: true`, `initiative: true` / `epic: true`, `plan_anchor`, parent wikilinks). **Never** adopt `kind` or `title` — those are not implemented.

Validate before and after writing:

```bash
curl -s -X POST "http://127.0.0.1:3001/api/cards/validate?vault=<vaultKey>" \
  -H 'Content-Type: application/json' \
  -d '{"cardId": "release-example-slug"}'
```

Run `GET /api/vaults/<vaultKey>/doctor` after batch edits. Non-zero exit: `./scripts/kando-doctor.sh <vaultKey>` (requires Kando running).

**Queue order:** Kando sorts Active, Prioritized, and Backlog by wiki-link order in `indexPath` (`roadmap-index.md`). When reprioritizing, update that file (or drag in Kando) — not `roadmap_order` on every card. Active cards may still carry auto-synced `roadmap_order` for Tolaria saved views.

### 3. Find and edit cards

- Search under `vaultPath` for `release-<slug>.md`, or use `roadmap-index.md` for discovery **and queue order**.
- Edit YAML frontmatter and Markdown body per conventions.
- Commit inside the **vault** git repository (`vaultPath`), which may differ from the app repo root.

### 4. PR links (optional)

If `canonicalRepo` is set:

```markdown
## Roadmap
https://github.com/<canonicalRepo>/blob/main/release-<slug>.md
```

### 5. Keep progress tracking current

Kando's **Workbench** view shows, at a glance, which slices are being
worked on and why — but only if agents keep the fields below up to date.
This is not optional busywork: it's how the human using Kando sees status
without asking you for an update. Update these on **every** slice you touch,
as part of the same edit, not as a separate step:

```yaml
agent_status: in_progress   # in_progress | blocked | needs_review | idle
agent_provider: cursor      # cursor | claude | codex | manual
agent_summary: "Wired the POS discount modal; validating against edge cases."
agent_next: "Add server-side validation, then update acceptance criteria."
agent_updated_at: 2026-07-25T14:32:00Z   # ISO 8601, set to "now" on every update
```

- `agent_status`: `in_progress` while actively working, `blocked` if stuck
  on something outside your control, `needs_review` once you've opened a PR
  or otherwise handed it off, `idle` (or omit the field) once you've
  stopped working on it for now.
- `agent_summary`: one or two sentences — current state, in plain language.
  This is the "why" a human sees first.
- `agent_next`: one sentence — what you (or whoever picks this up) would do
  next.
- All five fields are optional and additive to the existing frontmatter
  contract; omit them entirely on cards with no agent activity.

### 6. Suggesting what to work on next (optional)

If asked to suggest the next slices to prioritize, write your ranked list
to `agent-suggestions.md` in the vault root (sibling to `roadmap-index.md`)
instead of just replying in chat — this is what populates the "up next"
list in Kando's Workbench view:

```markdown
---
generated_at: 2026-07-25T14:00:00Z
generated_by: claude
context: "Focus on 2 epics at once: Checkout and Admin. Prioritize anything unblocking POS launch."
---

## Suggested next slices

1. [[release-foo-slug]] — Unblocks the POS launch checklist; no open dependencies.
2. [[release-bar-slug]] — Small, isolated, and finishes out the Admin epic.
```

- `context` in the frontmatter should capture whatever constraints the user
  gave you (focus areas, how many epics/initiatives to run in parallel,
  etc.) — Kando displays it alongside the list.
- Rank by dependency readiness, epic/initiative grouping against the
  stated constraints, and index/backlog order — same signals you'd use to
  reprioritize `roadmap-index.md` — and give each entry a one-line
  rationale.
- Overwrite the file each time you're asked to re-suggest; it's a snapshot,
  not a log.

### 7. Strategy setup (optional)

When a vault has no initiatives or the user wants to organize Now/Next/Later bets, use the **kando-strategy-setup** skill (or Kando's Strategy view **Set up strategy with AI** helper). Interview the user about focus first; propose 2–5 initiatives at the right altitude; write `initiative-*.md` files per the card contract and place them in strategy horizons.

### 8. Product Atlas (optional)

Kando's **Atlas** view visualizes product **entities** (nouns) in domain clusters, with roadmap **weather** joined from slice cards. It is enabled only when the vault contains **`product-atlas.json`** (schema **v2**).

| Piece | Location |
|-------|----------|
| Map file | `<vaultPath>/product-atlas.json` |
| Schema reference | Kando `templates/atlas/README.md` or `.kando/atlas/README.md` after pack sync |
| Example seed | `.kando/atlas/product-atlas.example.json` |
| API | `GET /api/atlas?vault=<vaultKey>` → `{ atlas, entityCards, warnings? }` |

**cardMapping** links slice ids to entity ids:

```json
"cardMapping": {
  "release-checkout-refunds": ["order", "payment"]
}
```

When creating Atlas for a new project, use **kando-atlas-setup**. When editing slices that touch product areas, use **kando-atlas-maintain** to keep `cardMapping` and entities current. Target **25–50 entities**; no x/y coordinates in the file.

## Offline and cloud agents

Cursor Cloud, Claude Code cloud, and other remote agents do not have your local `~/.cursor/skills` symlinks or `localhost:3001`. Use the **portable agent pack** vendored into app repos and vaults.

### Sync the pack

From the Kando repo:

```bash
./scripts/sync-agent-pack.sh --app-repo /path/to/app \
  --vault-key myproject \
  --vault-hint docs/roadmap \
  --vault-hint ../myproject-roadmap \
  --canonical-repo org/myproject-roadmap

# Also sync into a standalone roadmap vault repo (skills + .kando/, no kando.agent.json):
./scripts/sync-agent-pack.sh --vault /path/to/roadmap-vault
```

Or via the installer:

```bash
./scripts/install-agent-integrations.sh --app-repo /path/to/app --vault /path/to/roadmap-vault
```

### What gets committed in the app repo

| Path | Purpose |
|------|---------|
| `.kando/kando-for-agents.md` | Cold-start: Board, Strategy, Atlas, Workbench, hierarchy, offline workflow |
| `.kando/card-contract.json` | Static card write contract (regenerated from `electron/card-contract.js`) |
| `.kando/templates/{initiative,epic,slice}.md` | Scaffolds for new cards |
| `.kando/atlas/` | Atlas schema README + `product-atlas.example.json` |
| `.cursor/skills/` + `.claude/skills/` | `kando-roadmap-router`, `release-card-writing`, `kando-strategy-setup`, `kando-atlas-setup`, `kando-atlas-maintain` |
| `kando.agent.json` | Relative vault discovery (`vaultPathHints`) — no absolute paths |
| `AGENTS.md` / `CLAUDE.md` | Marked entry block pointing at `.kando/` |

### Resolve order (cloud / offline)

1. **`GET /api/routing/resolve`** when Kando is running locally (preferred).
2. Read **`kando.agent.json`** → try each `vaultPathHints` path relative to the workspace until conventions file exists.
3. Read **`.kando/card-contract.json`** and the vault's `roadmap-conventions.md`.
4. Ask the user — do not guess vault paths.

Regenerate the pack contract after changing `electron/card-contract.js`:

```bash
npm run generate:agent-pack
```

## `vaults.json` routing schema

```json
{
  "vaults": {
    "myproject": "/absolute/path/to/roadmap-vault"
  },
  "routing": {
    "myproject": {
      "workspaceRoots": [
        "/absolute/path/to/app-repo",
        "/absolute/path/to/app-repo-pr*"
      ],
      "conventionsFile": "roadmap-conventions.md",
      "indexFile": "roadmap-index.md",
      "canonicalRepo": "org/roadmap-repo"
    }
  }
}
```

- **`workspaceRoots`**: Directory paths; `*` matches one path segment (glob).
- **`conventionsFile` / `indexFile`**: Filenames relative to `vaultPath`.

## Other API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Server up; vault keys |
| GET | `/api/vaults` | All vaults + `routing` metadata |
| GET | `/api/cards?vault=<key>` | List release cards (includes `index_order` from index) |
| GET | `/api/cards/:id?vault=<key>` | Card detail |
| GET | `/api/roadmap-index?vault=<key>` | Parsed section order from index file |
| PUT | `/api/roadmap-index?vault=<key>` | Update Active / Prioritized / Backlog order in index |
| GET | `/api/agent-suggestions?vault=<key>` | Parsed `agent-suggestions.md` (see §6), resolved against cards |
| GET | `/api/vaults/:name/conventions` | Raw text of that vault's `roadmap-conventions.md` |
| GET | `/api/vaults/:name/card-contract` | Published card write contract for agents |
| GET | `/api/vaults/:name/doctor` | Vault contract / placement diagnostics |
| POST | `/api/cards/validate?vault=<key>` | Validate card frontmatter (dry-run or on disk) |

## Install for common agents

From the Kando repo:

```bash
./scripts/install-agent-integrations.sh --all
```

| Install target | Script flag | Result |
|----------------|-------------|--------|
| Cursor | `--cursor` | Skills in `~/.cursor/skills/` |
| OpenAI Codex | `--codex` | Skills in `~/.codex/skills/` |
| Claude Code | `--claude` | Skills + global `~/.claude/CLAUDE.md` |
| GitHub Copilot | `--copilot` | `~/.copilot/copilot-instructions.md` |
| Gemini | `--gemini` | `~/.gemini/GEMINI.md` |
| App repo | `--app-repo /path/to/app` | Portable agent pack in that repo (`.kando/`, skills, `kando.agent.json`) |
| Roadmap vault | `--vault /path/to/vault` | `.kando/` + skills in the vault repo |

Examples:

```bash
export KANDO_HOME=/path/to/kando
./scripts/install-agent-integrations.sh --cursor --codex
./scripts/sync-agent-pack.sh --app-repo ~/dev/venubase/venubase-web \
  --vault-key venubase --vault-hint docs/roadmap --vault-hint ../venubase-roadmap \
  --canonical-repo mattcrest/venubase-roadmap
./scripts/sync-agent-pack.sh --vault ~/dev/venubase-roadmap
```

See [templates/agents/README.md](../templates/agents/README.md) for details.
