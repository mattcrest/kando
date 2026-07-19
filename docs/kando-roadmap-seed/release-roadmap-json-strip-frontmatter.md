---
release: true
kind: slice
initiative: '[[initiative-storage-format]]'
title: Strip redundant frontmatter + retire sync
---

# Strip redundant frontmatter + retire sync

Once parity holds, remove `status` / `roadmap_order` / `horizon` / `milestone`
from card frontmatter, retire `syncActiveRoadmapOrder`, and stop reading the
initiative `## Epics` table (generate-only, if kept at all).

## Acceptance
- No code path writes organizational data back into card files.
- Cards carry only `release` / `kind` / `title` / parent link + body.
