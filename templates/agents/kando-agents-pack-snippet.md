## Roadmap cards (Kando)

This repo uses [Kando](https://github.com/mattcrest/kando) for roadmap cards (`release-*.md`, initiatives, epics).

**Start here:** `.kando/kando-for-agents.md` — Board, Strategy, Workbench, card hierarchy, offline workflow.

**Resolve vault:**

1. **Local (preferred):** `curl -s "http://127.0.0.1:3001/api/routing/resolve?workspaceRoot=<this-repo>"`
2. **Cloud / offline:** read `kando.agent.json` → try `vaultPathHints` → read `.kando/card-contract.json`

**Skills:** `.cursor/skills/kando-roadmap-router`, `release-card-writing`, `kando-strategy-setup`

**Rules:** never use `kind` or `title` frontmatter; follow the vault's `roadmap-conventions.md`; update `agent_*` fields on every slice you touch.
