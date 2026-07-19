---
release: true
kind: slice
initiative: '[[initiative-storage-format]]'
title: Flip the read path with a parity check
---

# Flip the read path with a parity check

Make `GET /api/cards` derive column membership + order from `roadmap.json`
instead of frontmatter `status` + `roadmap-index.md`. Gate the flip behind a
parity assertion (old derivation === new derivation).

## Acceptance
- Board renders identically before/after the flip on the real vault.
- Parity check fails loudly on any mismatch rather than silently diverging.
