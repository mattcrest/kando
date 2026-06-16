---
name: release-card-writing
description: >-
  Write or rewrite release-*.md roadmap cards so they scan well in Kando for a
  product builder. Use when creating, generating, drafting, or improving a
  release card, roadmap card, or release note body — especially before adding
  a new card to the vault.
---

# Release card writing (readable for product builders)

**Always start with kando-roadmap-router** to resolve the vault, then read that vault's `roadmap-conventions.md`. This skill adds **readability rules** on top of project conventions.

The reader is a **product builder** scanning cards in Kando — not an engineer grepping the repo. Write so the modal is scannable in under 60 seconds.

## Section order (fixed)

Use this order. Omit optional sections only when truly empty.

1. **Summary** — required
2. **Problem / context** — required for eng slices; 1–2 sentences for go-live ops notes
3. **Product outcome** — what becomes true for users/staff (not implementation)
4. **Stakeholders** — who cares (2–4 bullets)
5. **Behavior & requirements** — user-visible rules and edge cases
6. **Verification protocol** — numbered steps someone can run (QA / ops / you)
7. **Technical references** — repo paths, migrations, functions (for agents + eng)
8. **Out of scope** — explicit boundaries
9. **Acceptance criteria** — checkbox list (testable, outcome-focused)
10. **Dependencies** — `[[release-...]]` wikilinks
11. **PRs**
12. **Shipped** — when Done only

Merge **Implementation hints** into **Technical references** unless the vault conventions say otherwise.

## Writing style

### Summary (most important)

- **First sentence:** plain-language outcome — what ships or what gets verified.
- **Second sentence (optional):** why it matters or what it unblocks.
- Max **3 sentences**. No code, no table names, no RPC names in Summary.

**Good:** "Patrons see a paginated purchase history on `/account` — memberships and day passes in one list, read-only and venue-scoped."

**Bad:** "Expose a unified purchase history on `/account`: memberships, **online day passes**, and other Stripe-backed rows…"

### Problem / context

- One sentence: user or staff pain.
- One sentence: business or launch risk if we skip it.
- No stack traces, no migration filenames.

### Product outcome & Behavior

- Bullets: **one idea per line**, start with a verb or role.
- Describe **observable behavior**, not tables or functions.
- Bold a role name once per section (`**Patrons**`), not every other word.

### Verification protocol

- Numbered steps an operator can follow without opening the repo.
- Name test accounts or flows, not file paths (paths go in Technical references).

### Acceptance criteria

- Each item is **testable** and **user- or ops-visible**.
- Prefer outcomes over implementation ("Venue isolation verified in tests" not "Add RLS policy").
- 3–6 items typical; split the card if you need more.

### Technical references

- Concrete links to `venubase-web` (or the app repo) on GitHub.
- This is where migrations, RPCs, and file paths belong — not in Summary or Problem.

## Formatting rules (Kando modal)

These map to how Kando renders the card:

| Rule | Why |
|------|-----|
| `## Section` headings exactly as named above | Kando styles h2 as scan anchors |
| Blank line after every heading | Clean markdown parse |
| `- [ ]` checkboxes only under **Acceptance criteria** | Kando lifts AC into the modal checklist |
| Keep AC section **last** among body sections before Dependencies | Parser expects this block |
| Wikilinks `[[release-slug]]` in Dependencies | Clickable chips in sidebar |
| `category:` in frontmatter | Kanban tag + sidebar filter |
| Avoid walls of inline `` `code` `` in prose sections | Hard to read in modal; use **bold** for product terms |

## Anti-patterns (do not)

- Duplicating the same fact in Summary, Problem, and Behavior
- Burying the outcome in backticks and jargon in the opening paragraph
- Acceptance criteria that mirror Verification protocol verbatim
- More than **6** bullets under Behavior without subheadings (`###`)
- Paragraphs longer than **3 sentences**
- Placeholder sections with "TBD" body text — omit the section or write one honest line

## Frontmatter template

```yaml
---
type: Note
release: true
status: Backlog          # Backlog | Prioritized | Active | Blocked | Done
roadmap_order: null      # number when Prioritized/Active only
related_to: "[[venubase]]"
plan_anchor: Short human title (matches H1)
category: POS            # kanban tag — Admin, Checkout, Account, etc.
shipped_at: null
---
```

## Full body template

```markdown
# Short human title

## Summary

<1–3 sentences. Outcome first. Plain language.>

## Problem / context

<Why this exists — user pain + risk.>

## Product outcome

- <Observable result 1>
- <Observable result 2>

## Stakeholders

- **Role** — what they gain
- **Role** — what they gain

## Behavior & requirements

- <User-visible rule or edge case>
- <Another rule>

## Verification protocol

1. <Step someone can run>
2. <Step>

## Technical references

- [`path/to/file`](https://github.com/org/repo/blob/main/path/to/file) — one-line why

## Out of scope

- <Explicit exclusion with wikilink if another card owns it>

## Acceptance criteria

- [ ] <Testable outcome>
- [ ] <Testable outcome>

## Dependencies

- [[release-other-slice]] — one-line relationship

## PRs

- TBD
```

## Before finishing

1. Read the card aloud — if you stumble in the first paragraph, rewrite Summary.
2. Confirm a product builder can answer: **what**, **for whom**, **how we know it's done** without opening the repo.
3. Confirm Acceptance criteria items are checkbox-ready and distinct from Verification protocol steps.

## Related skills

- **kando-roadmap-router** — resolve vault + conventions path
- **venubase-roadmap** — Venubase git workflow and kanban status lifecycle
