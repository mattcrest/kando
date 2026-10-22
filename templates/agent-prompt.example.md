---
type: Note
implementation_repo: your-org/your-app
---

# Agent prompt — project notes

<!-- Kando appends this file to every "Copy agent prompt" for this vault; HTML comments like this one are left out. Keep it to rules an implementer would otherwise miss — the app repo's own AGENTS.md / CLAUDE.md holds the rest. Save it at the vault root as agent-prompt.md. -->

- **Read `AGENTS.md` at the root of the app repo first** and follow it.
- **Checks before every push:** `npm run lint`, `npm run typecheck`, `npm test`.
- **Migrations:** add a new migration; never edit one that has shipped.
- **Generated files:** list anything that must be regenerated and committed with a change (snapshots, previews, bundles), and the command for it.
- **Ship dark:** new user-facing behavior goes behind a flag or setting that is off by default.
- **Test data:** which tenant, account or fixture to use for manual verification.
