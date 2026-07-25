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

### 2. Load project conventions

Read `conventionsPath` and `indexPath` from the resolve response. Status values, required card sections, and lifecycle rules **vary by project** — always follow that vault’s `roadmap-conventions.md`, not assumptions from another project.

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
| App repo | `--app-repo /path/to/app` | Block in that repo’s `AGENTS.md` |

Examples:

```bash
export KANDO_HOME=/path/to/kando
./scripts/install-agent-integrations.sh --cursor --codex
./scripts/install-agent-integrations.sh --app-repo ~/dev/venubase/venubase-web --app-repo ~/dev/playerpath/playerpath-web
```

See [templates/agents/README.md](../templates/agents/README.md) for details.
