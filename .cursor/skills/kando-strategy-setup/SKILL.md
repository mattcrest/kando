---
name: kando-strategy-setup
description: >-
  Interview the user and scaffold Strategy initiatives (Now/Next/Later) for a Kando
  roadmap vault. Use when Strategy is empty, the user wants to organize initiatives,
  set up Now/Next/Later bets, or Kando's "Set up strategy with AI" helper was invoked.
---

# Kando strategy setup

Help a product builder organize their roadmap vault around **initiatives** — big bets
that group several workstreams (epics) and many finishable pieces (slices). The user
does not need to know those terms.

## Prerequisites

1. **kando-roadmap-router** — resolve vault + conventions.
2. Fetch the write contract:
   - **Online:** `GET /api/vaults/<vaultKey>/card-contract` (start Kando via **kando-dev-server** if needed)
   - **Offline / cloud:** `.kando/card-contract.json`
3. Vault health when API available (orphan epics, contract errors):

```bash
curl -s "http://127.0.0.1:3001/api/vaults/<vaultKey>/doctor"
```

## Interview first (required)

Before proposing initiatives, ask:

- What do you want to **focus on** right now?
- What does **winning** look like in plain language?
- Anything explicitly **out of scope** for this planning pass?

If the user is stuck, offer 3–5 short focus prompts tailored to what you read in the
repo (e.g. "Ship the mobile app", "Make checkout trustworthy", "Reduce ops toil").

**Do not** dump a full strategy before they answer.

## Calibrate altitude (plain language)

Explain initiative sizing without jargon:

| Too big | Too small | Right size (initiative) |
|---------|-----------|-------------------------|
| "The whole product" | One bug or one screen | A bet a non-engineer can name; needs **several themes** of work and **many small deliverables** |

Epics and slices can come later — initiatives are the "chapters."

## Read the vault

- `roadmap-conventions.md`, `roadmap-index.md`, `roadmap.json` (if present)
- Existing cards — **orphan epics** (no `initiative:` parent) are the best raw material
- Doctor report: fix **contract errors** before claiming Strategy is set up

## Propose 2–5 initiatives

For each, provide:

- **Title** — plain language, outcome-oriented
- **Why this bet** — one sentence
- **Horizon** — Now / Next / Later
- **Might break into…** — optional themes (not full epic files until confirmed)

Wait for user confirmation before writing files.

## Write (after confirmation)

1. Copy frontmatter shape from **card-contract** templates or an existing card in the vault.
2. Create `initiative-<slug>.md` with `release: true`, `initiative: true`, `plan_anchor:`.
3. Place in strategy:
   - **roadmap.json vaults:** add id to `strategy.horizons[].initiatives`
   - **legacy vaults:** set `horizon:` frontmatter + `strategy-index.md` if used
4. Link orphan epics when the user agrees (`initiative:` wikilink on epic + initiative ## Epics table).
5. Follow **release-card-writing** for body sections.
6. **Validate** before and after every file (see release-card-writing § Validate before you finish).
7. Run doctor again and report results to the user.

Stop at strategy scaffolding unless asked to draft epics or slices.

## Related skills

- **kando-roadmap-router** — vault resolution
- **release-card-writing** — readable cards + validation gate
- **kando-dev-server** — local API (optional)
