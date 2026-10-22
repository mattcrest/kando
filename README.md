# Kando

Local kanban UI and HTTP API for **Markdown roadmap cards** (`release-*.md`) in [Tolaria](https://github.com/refactoringhq/tolaria)-style vaults. Kando does not own your card files — it points at one or more vault directories on disk and can sync each vault’s git repo independently.

Use it to plan releasable slices, drag cards across columns, and let coding agents resolve **which roadmap belongs to which app repo** via a single config file.

## Features

- **Multi-vault** — Venubase, PlayerPath, or any project; switch vaults in the UI
- **Three-layer hierarchy** — initiatives (`initiative: true`) → epics (`epic: true`) → story slices, linked by frontmatter wikilinks (`initiative:` on epics, `epic:` on slices)
- **Board + Strategy + Atlas + Workbench views** — kanban board for execution; a Now/Next/Later roadmap of initiative rows with per-epic slice progress; an optional **Atlas** entity mind-map (`product-atlas.json`) with card-driven highlighting; a Workbench view showing which slices agents are actively working on (and why), an AI-suggested "up next" queue, and one-click prompts to hand a slice to a coding agent (header toggle)
- **Card-type filter** — All / Initiatives / Epics / Slices dropdown in the header
- **Initiative epic manager** — drag-to-reorder, add/remove, and annotate an initiative's epics from the card modal; writes the card's `## Epics` table and each epic's `initiative:` link
- **Cross-project routing** — `vaults.json` maps app repo paths → roadmap vault + convention files
- **Agent-agnostic API** — `GET /api/routing/resolve` for Cursor, Claude Code, Codex, Copilot, Gemini, or custom tools
- **Bundled agent integrations** — optional install scripts for common assistants ([templates/agents/README.md](templates/agents/README.md))
- **Git sync per vault** — commit/push roadmap changes from the Kando header (optional auto-commit on save)

## Quick start

```bash
git clone <your-fork-or-origin-url> kando
cd kando
npm install
cp vaults.example.json vaults.json
# Edit vaults.json: set vault paths and routing.workspaceRoots for your machine
npm run dev
```

Opens **http://127.0.0.1:3001** (or run `./scripts/kando-dev.sh start`).

```bash
./scripts/kando-dev.sh status   # check health
./scripts/kando-dev.sh stop
./scripts/kando-dev.sh restart
```

## How it fits together

```text
  app repo (e.g. venubase-web, playerpath-web)
       │
       │  routing.workspaceRoots in vaults.json
       ▼
  Kando (:3001)  ──►  roadmap vault directory
       │                 release-*.md
       │                 roadmap-conventions.md
       │                 roadmap-index.md
       └── git sync ──►  vault’s own git repo (may differ from app repo)
```

**This repo** = UI + API only. **Roadmap markdown** lives wherever you configure each vault path (submodule, sibling repo, or folder inside an app repo).

### Card hierarchy (frontmatter contract)

| Layer | Marker | Parent link | Shown in |
|-------|--------|-------------|----------|
| **Initiative** | `initiative: true` (+ optional `horizon: Now\|Next\|Later`, `milestone:`) | — | Strategy view lanes |
| **Epic** | `epic: true` | `initiative: '[[initiative-<slug>]]'` | Board; initiative epic manager |
| **Story slice** | neither flag | `epic: '[[release-epic-<slug>]]'` | Board; epic sidebar slice list |

All layers still require `release: true` to appear in Kando. The card modal derives its breadcrumb (Initiative › Epic › Slice) and progress roll-ups from these links. Per-vault details live in each vault's `roadmap-conventions.md`.

Slices also carry an optional set of **agent progress fields** —
`agent_status`, `agent_provider`, `agent_summary`, `agent_next`,
`agent_updated_at` — written by coding agents as they work, never by hand.
They power the **Workbench** view (see below) and are documented in
[docs/agent-routing.md](docs/agent-routing.md#5-keep-progress-tracking-current).

## Configuration (`vaults.json`)

Copy [`vaults.example.json`](vaults.example.json) → `vaults.json` (gitignored). Set absolute paths on your machine.

| Key | Purpose |
|-----|---------|
| `vaults` | Vault id → filesystem path to markdown root |
| `routing` | Vault id → `workspaceRoots`, convention filenames, optional `canonicalRepo` (roadmap repo), `implementationRepo` (app repo), `agentPromptFile` |
| `default` | Default vault in the UI |
| `git` | Per-vault auto-commit / push settings |
| `colors` | UI accent per vault |

### Routing example (two projects)

```json
{
  "vaults": {
    "venubase": "/path/to/venubase-roadmap",
    "playerpath": "/path/to/playerpath-roadmap"
  },
  "routing": {
    "venubase": {
      "workspaceRoots": ["/path/to/venubase-web", "/path/to/venubase/worktrees/*"],
      "conventionsFile": "roadmap-conventions.md",
      "indexFile": "roadmap-index.md",
      "canonicalRepo": "your-org/venubase-roadmap",
      "implementationRepo": "your-org/venubase-web"
    },
    "playerpath": {
      "workspaceRoots": ["/path/to/playerpath-web"],
      "conventionsFile": "roadmap-conventions.md",
      "indexFile": "roadmap-index.md",
      "canonicalRepo": "your-org/playerpath-roadmap"
    }
  }
}
```

- **`workspaceRoots`**: exact paths or globs (`*`). First match wins.
- **Adding a project**: new `vaults` + `routing` entries only — no code changes.

Override the default Venubase path without editing `vaults.json`:

```bash
export VENUBASE_ROADMAP_DIR=/path/to/roadmap-vault
```

## HTTP API

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Server status and vault keys |
| `GET /api/vaults` | Vault list with `routing` metadata |
| `GET /api/routing/resolve?workspaceRoot=<path>` | Map an app repo → vault + convention paths |
| `GET /api/cards?vault=<key>` | List `release: true` cards (includes `is_epic`, `is_initiative`, `horizon`, `milestone`, `parent`) |
| `GET/PUT /api/cards/:id` | Read/update card metadata and body |
| `GET/PUT /api/initiatives/:id/epics` | Read/reorder/add/remove an initiative's epics (syncs `## Epics` table + epic `initiative:` frontmatter) |
| `GET/PUT /api/roadmap-index?vault=<key>` | Read/update queue order in `roadmap-index.md` |
| `GET /api/agent-suggestions?vault=<key>` | Parsed `agent-suggestions.md`, resolved against cards (Workbench "up next") |
| `GET /api/atlas?vault=<key>` | Product entity map + `entityCards` join (`product-atlas.json` v2); `?fixture=1` for dev template |
| `GET /api/cards/:id/agent-prompt?vault=<key>` | Self-contained implementer prompt for a card (what **Copy agent prompt** copies) |
| `POST /api/cards/:id/agent-prompt/generate?vault=<key>` | Start a **Generate with Claude** job (read-only Claude Code run in the local checkout) |
| `GET /api/agent-prompt-jobs/:jobId` | Poll a generate job (`running` / `done` / `error`, `prompt`, `costUsd`) |
| `GET /api/cards/:id/agent-prompt/latest?vault=<key>` | Newest generate job for a card this session |
| `GET /api/vaults/:name/conventions` | Raw text of the vault's `roadmap-conventions.md` |
| `GET /api/vaults/:name/card-contract` | Published card write contract for agents |
| `GET /api/vaults/:name/doctor` | Vault contract / placement diagnostics |
| `POST /api/cards/validate?vault=<key>` | Validate card frontmatter (dry-run or on disk) |
| `GET /api/vaults/:name/git/status` | Git status for vault directory |
| `POST /api/vaults/:name/git/sync` | Commit and optional push |

```bash
curl -s "http://127.0.0.1:3001/api/routing/resolve?workspaceRoot=$PWD"
```

Full agent workflow: **[docs/agent-routing.md](docs/agent-routing.md)**. Entry point for tools that read **`AGENTS.md`** / **`CLAUDE.md`** in this repo.

## Coding agents

### Copy agent prompt

The card modal's **Copy agent prompt** button copies a self-contained prompt a cloud or local coding agent can start from. Kando assembles it from:

- the card itself (frontmatter and body), and its parents' **Summary**, **Out of scope** and **Notes** (decisions recorded on the epic travel with every slice);
- where the work happens: `implementationRepo` (app repo) and `canonicalRepo` (roadmap repo);
- a **verify-first** step: the agent checks the card's Technical references against the current code and writes a plan before coding;
- delivery steps (checks, PR with a `## Roadmap` link, report back), the Workbench `agent_*` field rules, and only the **When something ships** section of the vault's conventions;
- the vault's **`agent-prompt.md`** if present: project notes for implementers (check commands, migration rules, gotchas). Its frontmatter may set `implementation_repo` when routing doesn't; HTML comments are left out. Starter: [`templates/agent-prompt.example.md`](templates/agent-prompt.example.md).

### Generate with Claude

**Generate with Claude** (next to Copy agent prompt) runs [Claude Code](https://code.claude.com) headless and **read-only** (`Read`, `Grep`, `Glob` only) in your local checkout of the app repo. Claude checks the card's Technical references against the code and writes four sections: **Verified against the code**, **Files and tests to touch**, **Watch out for**, and **Open questions**. Kando inserts them into the prompt above the card. The card text itself is never rewritten. You review and edit the result before copying it.

- **Needs:** the `claude` CLI signed in on this machine, and a literal path (no `*`) to the app checkout in `routing.<vault>.workspaceRoots`. Claude reads whatever that checkout has; pull first if it's behind.
- **Cost and time:** usually one to two minutes. The dialog shows Claude Code's estimate at API rates (about $0.30 for a typical slice in testing). Where it's actually billed depends on how `claude` is signed in: a Claude subscription counts it toward plan usage with no separate charge; an API key or Console login bills that Console organization; Bedrock/Vertex bill your cloud account. Kando passes its own environment to `claude`, so an `ANTHROPIC_API_KEY` in the shell that started Kando takes precedence over a subscription login.
- **Reuse:** the result is kept for the session, so reopening the dialog doesn't run it again; **Regenerate** does.
- **Finding `claude`:** apps started from the Dock or Finder don't get your shell's PATH, so Kando also reads your login shell's PATH and checks common install locations (`~/.local/bin`, `~/.claude/local`, Homebrew, `/usr/local/bin`, npm-global, Volta, Bun). That PATH is also passed to Claude, so an npm-installed `claude` can find `node`. If it still can't be found, set `KANDO_CLAUDE_BIN` to the output of `which claude` (or the target of a `claude` alias).
- **Settings:** `KANDO_CLAUDE_BIN` (path to `claude`), `KANDO_CLAUDE_MODEL` (for example `sonnet`).

### Portable pack (app repos + cloud)

Sync a self-contained agent pack into each app repo — works for **Cursor Cloud** and **Claude Code cloud** without local skills or `localhost:3001`:

```bash
./scripts/sync-agent-pack.sh --app-repo /path/to/app \
  --vault-key venubase \
  --vault-hint docs/roadmap \
  --vault-hint ../venubase-roadmap \
  --canonical-repo your-org/venubase-roadmap

# Standalone roadmap vault:
./scripts/sync-agent-pack.sh --vault /path/to/venubase-roadmap
```

Commits `.kando/`, project skills, `kando.agent.json`, and `AGENTS.md`/`CLAUDE.md` entry blocks. See [docs/agent-routing.md](docs/agent-routing.md#offline-and-cloud-agents).

### Local machine install

Install global skills and memory snippets once (paths use `KANDO_HOME` if set):

```bash
export KANDO_HOME=/path/to/kando   # optional
npm run install:agents
# same as: ./scripts/install-agent-integrations.sh --all
```

| Flag | Tool |
|------|------|
| `--cursor` | Cursor → `~/.cursor/skills/` |
| `--codex` | OpenAI Codex → `~/.codex/skills/` |
| `--claude` | Claude Code skills + `~/.claude/CLAUDE.md` |
| `--copilot` | GitHub Copilot → `~/.copilot/copilot-instructions.md` |
| `--gemini` | Gemini → `~/.gemini/GEMINI.md` |
| `--app-repo PATH` | Sync portable agent pack into that repo |
| `--vault PATH` | Sync `.kando/` + skills into roadmap vault |

| Skill | Purpose |
|-------|---------|
| `kando-roadmap-router` | Resolve workspace → vault; follow per-project conventions |
| `kando-dev-server` | Start/stop Kando on port 3001 |
| `release-card-writing` | Draft readable card bodies (vendored in pack) |
| `kando-strategy-setup` | Scaffold Strategy initiatives (vendored in pack) |
| `kando-atlas-setup` | Scaffold `product-atlas.json` for Atlas (vendored in pack) |
| `kando-atlas-maintain` | Keep Atlas `cardMapping` current (vendored in pack) |
| `venubase-roadmap` | Venubase-specific paths only (not vendored) |
| `venubase-roadmap-submodule` | Venubase `docs/roadmap` submodule bump (Venubase only) |

Details: [templates/agents/README.md](templates/agents/README.md).

## Git sync

Kando’s **Commit & Push** operates on the **vault directory’s** git repo (not necessarily the app repo).

```json
"git": {
  "venubase": { "autoCommit": true, "autoPush": false, "remote": "origin", "branch": "main" }
}
```

Or `KANDO_AUTO_GIT_COMMIT=1` globally.

**Push fails with “could not read Username for https://github.com”?** Kando retries via SSH when HTTPS has no credentials (common when the server runs non-interactively). Ensure your GitHub SSH key is loaded (`ssh -T git@github.com`). Prefer SSH remotes: `git remote set-url origin git@github.com:ORG/venubase-roadmap.git`.

## Example: Venubase layout

```text
dev/
  kando/
  venubase-roadmap/              ← Kando vault (canonical — edit cards here)
  venubase/venubase-web/
    docs/roadmap/                 ← git submodule pin (same repo, not the Kando path)
```

- Point the `venubase` vault at the **`venubase-roadmap`** checkout (sibling of `kando` under `dev/`).
- Kando **Commit & Push** updates **`venubase-roadmap`** on GitHub.
- `venubase-web/docs/roadmap/` is a submodule for the app repo; bump it when collaborators need a fresh pin on `main` — not for every card edit. See **venubase-roadmap-submodule** (venubase-web or Kando skills).
- PR roadmap links: `https://github.com/<org>/venubase-roadmap/blob/main/release-<slug>.md`
- Do **not** point Kando at `docs/roadmap/` unless you intentionally have no standalone `venubase-roadmap` clone (easy to drift from the repo you push).

## Scripts & npm commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | API + static UI (opens browser) |
| `npm run server` | API only |
| `npm start` | Electron shell |
| `npm run install:agents` | Install agent integrations (`--all`) |
| `npm run generate:agent-pack` | Regenerate `templates/agent-pack/card-contract.json` |
| `npm run install:cursor-skills` | Cursor skills only |
| `./scripts/kando-dev.sh` | Start / stop / restart / status |
| `./scripts/sync-agent-pack.sh` | Vendor agent pack into app repo or vault |
| `./scripts/install-agent-integrations.sh` | Per-tool agent install |
| `./scripts/install-app-repo-snippet.sh <repo>` | Add Kando block to app `AGENTS.md` |
