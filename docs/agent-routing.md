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
