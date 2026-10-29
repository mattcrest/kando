import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groupEpicSlices } from '../electron/epic-waves.js';

const COPY_EPIC = `
## Story slices

Waves and dispatch detail live in the plan.

| Slice | Status | Notes |
|-------|--------|-------|
| [[release-site-copy-slot-contract]] | Done | Wave 1 — PR #334 |
| [[release-site-edit-inline-text-primitives]] | Done | **Wave 1** — PR #335 |
| [[release-about-copy-cutover]] | Done | Wave 2 — PR #336 |
| [[release-site-copy-inline-editing]] | Done | Wave 3 — merged |
| [[release-site-copy-formatting-links]] | Backlog | Post–Wave 5 — prose-v2 profile |
| [[release-site-copy-region-layouts]] | Backlog | Post-Wave 5 — layout picker |
`;

const CONTENT_EDITOR = `
## Story slices

### Wave 0 — Proven foundations

| Slice | Status | Notes |
|-------|--------|-------|
| [[release-recognition-list-schema]] | Done | Structured public-list schema |
| [[release-founding-friends-donor-cms]] | Done | First structured-list editor |

### Wave 1 — About first

| Slice | Status | Notes |
|-------|--------|-------|
| [[release-about-people-cms]] | Done | PR #281 |
| [[release-epic-site-copy-editing]] | Done | Nested epic — not a slice |
| [[release-about-people-inplace-editing]] | Done | PR #329 |

### Wave 10 — Much later

| Slice | Status | Notes |
|-------|--------|-------|
| [[release-sitewide-polish]] | Backlog | graduation |

### Leftovers

| Slice | Status | Notes |
|-------|--------|-------|
| [[release-orphan-slice]] | Backlog | no wave of its own |
`;

describe('groupEpicSlices', () => {
  it('groups notes that start with Wave N and sends Post–Wave to Later', () => {
    const grouped = groupEpicSlices(COPY_EPIC, [
      'release-site-copy-inline-editing',
      'release-site-copy-slot-contract',
      'release-site-edit-inline-text-primitives',
      'release-about-copy-cutover',
      'release-site-copy-formatting-links',
      'release-site-copy-region-layouts',
    ]);
    assert.equal(grouped.total, 6);
    assert.equal(grouped.waveCount, 3);
    assert.deepEqual(
      grouped.groups.map((group) => [group.label, group.ids]),
      [
        ['Wave 1', ['release-site-copy-slot-contract', 'release-site-edit-inline-text-primitives']],
        ['Wave 2', ['release-about-copy-cutover']],
        ['Wave 3', ['release-site-copy-inline-editing']],
        ['Later', ['release-site-copy-formatting-links', 'release-site-copy-region-layouts']],
      ]
    );
  });

  it('reads ### Wave headings, keeps table order, and drops nested epics that are not slices', () => {
    const grouped = groupEpicSlices(CONTENT_EDITOR, [
      'release-about-people-inplace-editing',
      'release-recognition-list-schema',
      'release-founding-friends-donor-cms',
      'release-about-people-cms',
      'release-sitewide-polish',
      'release-orphan-slice',
    ]);
    assert.equal(grouped.waveCount, 3);
    assert.deepEqual(
      grouped.groups.map((group) => ({
        label: group.label,
        title: group.title,
        ids: group.ids,
      })),
      [
        {
          label: 'Wave 0',
          title: 'Proven foundations',
          ids: ['release-recognition-list-schema', 'release-founding-friends-donor-cms'],
        },
        {
          label: 'Wave 1',
          title: 'About first',
          ids: ['release-about-people-cms', 'release-about-people-inplace-editing'],
        },
        {
          label: 'Wave 10',
          title: 'Much later',
          ids: ['release-sitewide-polish'],
        },
        {
          label: 'Not in a wave',
          title: '',
          ids: ['release-orphan-slice'],
        },
      ]
    );
  });

  it('keeps 1a and 1b as separate rows and sorts Wave 2 before Wave 10', () => {
    const content = `
## Story slices
| Slice | Status | Notes |
| --- | --- | --- |
| [[release-late]] | Backlog | Wave 10 — last |
| [[release-b]] | Backlog | Wave 1b — primitives |
| [[release-a]] | Backlog | Wave 1a — contract |
| [[release-c]] | Backlog | Wave 2 — cutover |
`;
    const grouped = groupEpicSlices(content, [
      'release-late',
      'release-b',
      'release-a',
      'release-c',
    ]);
    assert.deepEqual(
      grouped.groups.map((group) => group.label),
      ['Wave 1a', 'Wave 1b', 'Wave 2', 'Wave 10']
    );
  });

  it('does not treat a Wave mention later in the note as membership', () => {
    const content = `
## Story slices
| Slice | Status | Notes |
| --- | --- | --- |
| [[release-early]] | Done | shipped #242 |
| [[release-late]] | Done | Wave 6 PR C — shipped #252 |
| [[release-aside]] | Done | shipped #244; found during Wave 6 |
`;
    const grouped = groupEpicSlices(content, [
      'release-early',
      'release-late',
      'release-aside',
    ]);
    assert.deepEqual(
      grouped.groups.map((group) => [group.label, group.ids]),
      [
        ['Wave 6', ['release-late']],
        ['Not in a wave', ['release-early', 'release-aside']],
      ]
    );
  });

  it('lets a note move a slice out of its heading wave', () => {
    const content = `
## Story slices
### Wave 1 — Foundations
| Slice | Status | Notes |
| --- | --- | --- |
| [[release-a]] | Done | stays here |
| [[release-b]] | Done | Wave 3 — moved |
`;
    const grouped = groupEpicSlices(content, ['release-a', 'release-b']);
    assert.deepEqual(
      grouped.groups.map((group) => ({ label: group.label, title: group.title, ids: group.ids })),
      [
        { label: 'Wave 1', title: 'Foundations', ids: ['release-a'] },
        { label: 'Wave 3', title: '', ids: ['release-b'] },
      ]
    );
  });

  it('reads a wave from the last column when the slice is not the first cell', () => {
    const content = `
## Story slices
| # | Slice | Status | Notes |
| --- | --- | --- | --- |
| 1 | [[release-grid-autosave-component-tests]] | Done (#129) | Wave 3 MQ #1 |
| 2 | [[release-finals-grid-component-tests|Finals grid]] | Done (#131) | Wave 3 MQ #2 |
`;
    const grouped = groupEpicSlices(content, [
      'release-finals-grid-component-tests',
      'release-grid-autosave-component-tests',
    ]);
    assert.deepEqual(grouped.groups, [
      {
        key: '3',
        label: 'Wave 3',
        title: '',
        ids: ['release-grid-autosave-component-tests', 'release-finals-grid-component-tests'],
      },
    ]);
  });

  it('draws one Slices bar when the epic never names a wave', () => {
    const content = `
## Story slices
| Slice | Status | Notes |
| --- | --- | --- |
| [[release-b]] | Backlog | second |
| [[release-a]] | Active | first |
`;
    const grouped = groupEpicSlices(content, ['release-a', 'release-b']);
    assert.equal(grouped.waveCount, 0);
    assert.deepEqual(grouped.groups, [
      { key: 'slices', label: 'Slices', title: '', ids: ['release-b', 'release-a'] },
    ]);
  });

  it('puts child slices missing from the table on the unwaved bar, in caller order', () => {
    const content = `
## Story slices
| Slice | Status | Notes |
| --- | --- | --- |
| [[release-a]] | Done | Wave 1 — first |
`;
    const grouped = groupEpicSlices(content, ['release-extra', 'release-a', 'release-also']);
    assert.deepEqual(
      grouped.groups.map((group) => [group.label, group.ids]),
      [
        ['Wave 1', ['release-a']],
        ['Not in a wave', ['release-extra', 'release-also']],
      ]
    );
  });

  it('returns no groups when the epic has no slices', () => {
    assert.deepEqual(groupEpicSlices(COPY_EPIC, []), {
      total: 0,
      waveCount: 0,
      groups: [],
    });
  });
});
