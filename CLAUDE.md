# Kando

Follow [AGENTS.md](AGENTS.md) and the agent-agnostic routing spec in [docs/agent-routing.md](docs/agent-routing.md).

When the user mentions roadmap cards or `release-*.md`, resolve the vault via `GET http://127.0.0.1:3001/api/routing/resolve?workspaceRoot=<repo>` before editing files.
