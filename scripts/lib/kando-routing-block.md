## Kando roadmap routing

When the user mentions Kando, roadmap cards, or `release-*.md`:

1. Read `.kando/kando-for-agents.md` in the workspace (or `KANDO_HOME/docs/agent-routing.md` when Kando is the workspace).
2. Resolve vault: `curl -s "http://127.0.0.1:3001/api/routing/resolve?workspaceRoot=<app-repo>"` — or `kando.agent.json` + `vaultPathHints` when offline/cloud.
3. Fetch card contract: live API `cardContractPath` or `.kando/card-contract.json`.
4. Follow that vault's `roadmap-conventions.md`; validate with `POST /api/cards/validate` when Kando is running — never use `kind` or `title` frontmatter.
