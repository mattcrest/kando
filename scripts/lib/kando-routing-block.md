## Kando roadmap routing

When the user mentions Kando, roadmap cards, or `release-*.md`:

1. Read `KANDO_HOME/docs/agent-routing.md` (set `KANDO_HOME` to your Kando checkout).
2. Resolve workspace: `curl -s "http://127.0.0.1:3001/api/routing/resolve?workspaceRoot=<app-repo>"`
3. Follow that vault's `roadmap-conventions.md` before editing cards.
