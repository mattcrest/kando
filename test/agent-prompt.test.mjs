import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAgentPrompt,
  extractSection,
  parseAgentPromptFile,
  splitFrontmatter,
} from '../electron/agent-prompt.js';

const CONVENTIONS = `# Roadmap conventions

## Frontmatter

Lots of initiative/epic template detail an implementer does not need.

## When something ships

**Story slice:**

1. Set **status: Done** on the slice file.
2. Update the parent epic's Story slices table.

### Epic

1. Set epic status: Done when criteria are met.

## Views

Kando view detail.
`;

const SLICE_RAW = `---
type: Note
release: true
status: Prioritized
epic: '[[release-epic-party]]'
plan_anchor: Deposit on quote
agent_status: idle
---

# Deposit on quote

## Summary

Staff can set a deposit.

## Technical references

- Quote editor: GroupRentalQuoteEditor.tsx
`;

const EPIC_RAW = `---
release: true
epic: true
plan_anchor: Party booking automation
---

# Party booking automation

## Summary

Run parties online.

## Story slices

| Slice | Status |

## Out of scope

- Signed rental agreements.

## Notes

Owner decision: per-venue refund setting.
`;

const INITIATIVE_RAW = `---
release: true
initiative: true
plan_anchor: Launch-ready venue
---

# Launch-ready venue

## Summary

Venues look credible on day one.

## Epics

| Epic | Status |
`;

const slice = { id: 'release-deposit-on-quote', plan_anchor: 'Deposit on quote', status: 'Prioritized', path: 'release-deposit-on-quote.md' };
const epic = { id: 'release-epic-party', plan_anchor: 'Party booking automation', is_epic: true };
const initiative = { id: 'initiative-launch', plan_anchor: 'Launch-ready venue', is_initiative: true };

function build(overrides = {}) {
  return buildAgentPrompt({
    card: slice,
    cardRaw: SLICE_RAW,
    ancestors: [
      { card: initiative, raw: INITIATIVE_RAW },
      { card: epic, raw: EPIC_RAW },
    ],
    vaultKey: 'venubase',
    canonicalRepo: 'acme/roadmap',
    implementationRepos: ['acme/web'],
    conventionsText: CONVENTIONS,
    projectNotes: 'Run `npm test` before pushing.',
    ...overrides,
  });
}

describe('extractSection', () => {
  it('returns the section body up to the next same-level heading, keeping subheadings', () => {
    const text = extractSection(CONVENTIONS, 'When something ships');
    assert.match(text, /Set \*\*status: Done\*\*/);
    assert.match(text, /### Epic/);
    assert.doesNotMatch(text, /Kando view detail/);
  });

  it('matches case-insensitively and returns empty when missing', () => {
    assert.match(extractSection(EPIC_RAW, 'out of SCOPE'), /Signed rental agreements/);
    assert.equal(extractSection(EPIC_RAW, 'Shipped'), '');
  });

  it('reads to the end of the document for the last section', () => {
    assert.match(extractSection(EPIC_RAW, 'Notes'), /per-venue refund setting/);
  });
});

describe('splitFrontmatter', () => {
  it('keeps frontmatter as written and returns the body', () => {
    const { frontmatterText, body } = splitFrontmatter(SLICE_RAW);
    assert.match(frontmatterText, /^type: Note/);
    assert.match(frontmatterText, /agent_status: idle/);
    assert.match(body, /^# Deposit on quote/);
  });

  it('handles files without frontmatter', () => {
    assert.deepEqual(splitFrontmatter('# Just a body'), { frontmatterText: '', body: '# Just a body' });
  });
});

describe('parseAgentPromptFile', () => {
  it('reads implementation_repo from frontmatter and strips the H1', () => {
    const parsed = parseAgentPromptFile('---\nimplementation_repo: acme/web\n---\n\n# Agent prompt\n\nRun the tests.\n');
    assert.deepEqual(parsed.implementationRepos, ['acme/web']);
    assert.equal(parsed.notes, 'Run the tests.');
  });

  it('drops HTML comments meant for people editing the file', () => {
    const parsed = parseAgentPromptFile('# Agent prompt\n\n<!-- Keep this short. -->\n\n- Run the tests.\n');
    assert.equal(parsed.notes, '- Run the tests.');
  });

  it('accepts a list of repos and an empty file', () => {
    assert.deepEqual(
      parseAgentPromptFile('---\nimplementation_repos:\n  - acme/web\n  - acme/api\n---\nNotes').implementationRepos,
      ['acme/web', 'acme/api']
    );
    assert.deepEqual(parseAgentPromptFile(''), { implementationRepos: [], notes: '' });
  });
});

describe('buildAgentPrompt', () => {
  it('names the implementation repo and the vault repo separately', () => {
    const prompt = build();
    assert.match(prompt, /\*\*Implement in:\*\* acme\/web/);
    assert.match(prompt, /\*\*Roadmap vault:\*\* acme\/roadmap \(vault "venubase"\)/);
    assert.match(prompt, /Breadcrumb:\*\* Launch-ready venue › Party booking automation › Deposit on quote/);
  });

  it('falls back to the Technical references when no implementation repo is known', () => {
    assert.match(build({ implementationRepos: [] }), /the app repository the Technical references link to/);
  });

  it('includes the card frontmatter and body', () => {
    const prompt = build();
    assert.match(prompt, /<card file="release-deposit-on-quote\.md">\n---\ntype: Note[\s\S]*agent_status: idle\n---/);
    assert.match(prompt, /- Quote editor: GroupRentalQuoteEditor\.tsx\n<\/card>/);
    assert.match(prompt, /## Technical references\n\n- Quote editor/);
  });

  it('carries parent Summary, Out of scope, and Notes but not slice tables', () => {
    const prompt = build();
    assert.match(prompt, /### Epic: Party booking automation/);
    assert.match(prompt, /Signed rental agreements/);
    assert.match(prompt, /per-venue refund setting/);
    assert.match(prompt, /### Initiative: Launch-ready venue[\s\S]*Venues look credible/);
    assert.doesNotMatch(prompt, /\| Slice \| Status \|/);
    assert.doesNotMatch(prompt, /\| Epic \| Status \|/);
  });

  it('appends project notes and only the ship checklist from conventions', () => {
    const prompt = build();
    assert.match(prompt, /## Project notes for implementers \(agent-prompt\.md\)\n\nRun `npm test`/);
    assert.match(prompt, /## When it ships[\s\S]*Update the parent epic's Story slices table/);
    assert.doesNotMatch(prompt, /initiative\/epic template detail/);
    assert.doesNotMatch(prompt, /Kando view detail/);
  });

  it('asks the agent to verify Technical references before coding', () => {
    const prompt = build();
    assert.match(prompt, /Step 1 — Orient and verify \(before writing code\)/);
    assert.match(prompt, /Check every claim in the card's \*\*Technical references\*\* against the current code/);
  });

  it('includes the PR roadmap link and Workbench field rules', () => {
    const prompt = build();
    assert.match(prompt, /```markdown\n## Roadmap\nhttps:\/\/github\.com\/acme\/roadmap\/blob\/main\/release-deposit-on-quote\.md\n```/);
    assert.match(prompt, /agent_status: in_progress \| blocked \| needs_review \| idle/);
  });

  it('never includes a local filesystem path', () => {
    assert.doesNotMatch(build(), /\/Users\/|\/home\//);
  });

  it('omits empty optional sections', () => {
    const prompt = build({ ancestors: [], projectNotes: '', conventionsText: '' });
    assert.doesNotMatch(prompt, /## Parent context/);
    assert.doesNotMatch(prompt, /## Project notes/);
    assert.doesNotMatch(prompt, /## When it ships/);
  });
});
