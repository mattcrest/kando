---
release: true
kind: slice
initiative: '[[initiative-storage-format]]'
title: Prove extensibility — add a third view section
---

# Prove extensibility — add a third view section

Validate guardrail 4 by adding one new top-level section (e.g. `timeline`)
beside `kanban` / `strategy`, and confirm older code ignores unknown sections
without dropping them on rewrite.

## Acceptance
- Round-trip through an older loader preserves the unknown section verbatim.
