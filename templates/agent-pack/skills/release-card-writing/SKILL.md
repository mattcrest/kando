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

**Concepts:** `.kando/kando-for-agents.md` · **Templates:** `.kando/templates/{initiative,epic,slice}.md`

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

### Problem / context

- One sentence: user or staff pain.
- One sentence: business or launch risk if we skip it.
- No stack traces, no migration filenames.

### Product outcome & Behavior

- Bullets: **one idea per line**, start with a verb or role.
- Describe **observable behavior**, not tables or functions.

### Acceptance criteria

- Each item is **testable** and **user- or ops-visible**.
- 3–6 items typical; split the card if you need more.

### Technical references

- Concrete links to the app repo on GitHub.
- Migrations, RPCs, and file paths belong here — not in Summary or Problem.

## Formatting rules (Kando modal)

| Rule | Why |
|------|-----|
| `## Section` headings exactly as named above | Kando styles h2 as scan anchors |
| Blank line after every heading | Clean markdown parse |
| `- [ ]` checkboxes only under **Acceptance criteria** | Kando lifts AC into the modal checklist |
| Wikilinks `[[release-slug]]` in Dependencies | Clickable chips in sidebar |

## Frontmatter template

Copy from `.kando/card-contract.json` and an existing card in the vault. Minimal slice stub:

```yaml
---
release: true
plan_anchor: Short human title (matches H1)
status: Backlog
epic: '[[release-epic-example]]'
---
```

Add the card to the appropriate section in **`roadmap-index.md`** when it enters Prioritized, Active, or Backlog.

## Validate before you finish

**When Kando is running (port 3001):**

1. `GET /api/vaults/<vaultKey>/card-contract`
2. `POST /api/cards/validate?vault=<key>` before and after writing
3. `GET /api/vaults/<vaultKey>/doctor` after batch edits

**Offline / cloud:** read `.kando/card-contract.json`, `roadmap-conventions.md`, and copy frontmatter from an existing card in that vault. Never adopt `kind` or `title`.

## Related skills

- **kando-roadmap-router** — resolve vault + conventions path
- **kando-strategy-setup** — scaffold initiatives for an empty Strategy view
