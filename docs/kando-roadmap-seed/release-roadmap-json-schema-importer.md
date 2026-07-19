---
release: true
kind: slice
initiative: '[[initiative-storage-format]]'
title: Schema + additive importer
---

# Schema + additive importer

Rename `kanban.json` → `roadmap.json`, add the `version` / `vault` / `kanban` /
`strategy` shape, and write a one-time importer that derives `roadmap.json`
from today's frontmatter `status` + `roadmap-index.md` order **without touching
any Markdown**.

## Acceptance
- `roadmap.json` written for a vault matches current column membership + order.
- Importer is idempotent; re-running produces no diff.
- Old Markdown is left byte-for-byte unchanged (additive step).
