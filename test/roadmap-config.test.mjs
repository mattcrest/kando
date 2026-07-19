import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import {
  buildRoadmapConfig,
  normalizeConfig,
  toLegacyConfig,
  applyConfigEdits,
  serializeConfig,
} from '../electron/roadmap-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMPORT_SCRIPT = path.resolve(__dirname, '../scripts/import-roadmap-json.mjs');

const sampleCards = [
  { id: 'release-beta', status: 'Active', title: 'Beta' },
  { id: 'release-alpha', status: 'Active', title: 'Alpha' },
  { id: 'release-gamma', status: 'Backlog', title: 'Gamma' },
  { id: 'release-shipped', status: 'Done', shipped_at: '2026-01-01', title: 'Shipped' },
  { id: 'initiative-one', status: 'Backlog', is_initiative: true, horizon: 'Now', title: 'One' },
];
const sampleIndex = { Active: ['release-beta', 'release-alpha'], Backlog: ['release-gamma'] };

test('buildRoadmapConfig: columns in default order, index-driven membership', () => {
  const cfg = buildRoadmapConfig({ cards: sampleCards, indexOrders: sampleIndex });
  assert.equal(cfg.version, 1);
  assert.deepEqual(cfg.kanban.columns.map((c) => c.key), ['Done', 'Active', 'Backlog']);

  const byKey = Object.fromEntries(cfg.kanban.columns.map((c) => [c.key, c.cards]));
  assert.deepEqual(byKey.Active, ['release-beta', 'release-alpha']); // index order, not alpha
  assert.deepEqual(byKey.Done, ['release-shipped']);
  // gamma is in the index; the initiative is not, so it appends after
  assert.deepEqual(byKey.Backlog, ['release-gamma', 'initiative-one']);
});

test('buildRoadmapConfig: strategy groups initiatives by horizon', () => {
  const cfg = buildRoadmapConfig({ cards: sampleCards, indexOrders: sampleIndex });
  assert.deepEqual(cfg.strategy.horizons, [{ key: 'Now', initiatives: ['initiative-one'] }]);
});

test('buildRoadmapConfig: column labels come from STATUS_LABELS', () => {
  const cfg = buildRoadmapConfig({ cards: sampleCards, indexOrders: sampleIndex });
  const done = cfg.kanban.columns.find((c) => c.key === 'Done');
  assert.equal(done.label, 'Shipped');
});

test('buildRoadmapConfig: idempotent — rebuilding yields identical output', () => {
  const a = buildRoadmapConfig({ cards: sampleCards, indexOrders: sampleIndex });
  const b = buildRoadmapConfig({ cards: sampleCards, indexOrders: sampleIndex, existing: a });
  assert.equal(serializeConfig(a), serializeConfig(b));
});

test('buildRoadmapConfig: preserves existing vault meta, labels, and unknown sections', () => {
  const existing = {
    version: 1,
    vault: { name: 'Demo', color: '#abc' },
    kanban: { columns: [{ key: 'Active', label: 'Doing', cards: [] }] },
    strategy: { horizons: [] },
    timeline: { rows: ['keep-me'] },
  };
  const cfg = buildRoadmapConfig({ cards: sampleCards, indexOrders: sampleIndex, existing });
  assert.deepEqual(cfg.vault, { name: 'Demo', color: '#abc' });
  assert.equal(cfg.kanban.columns.find((c) => c.key === 'Active').label, 'Doing'); // custom label kept
  assert.deepEqual(cfg.timeline, { rows: ['keep-me'] }); // unknown section carried through
});

test('normalizeConfig: legacy kanban.json shape maps into the new shape', () => {
  const legacy = { name: 'Old', color: '#123', columns: [{ key: 'Backlog', label: 'Backlog' }] };
  const n = normalizeConfig(legacy);
  assert.equal(n.version, 1);
  assert.deepEqual(n.vault, { name: 'Old', color: '#123' });
  assert.equal(n.kanban.columns[0].key, 'Backlog');
  assert.deepEqual(n.strategy, { horizons: [] });
});

test('toLegacyConfig: exposes name/color/columns for existing consumers', () => {
  const n = normalizeConfig({ version: 1, vault: { name: 'X', color: '#f00' }, kanban: { columns: [{ key: 'Active' }] } });
  const legacy = toLegacyConfig(n);
  assert.equal(legacy.name, 'X');
  assert.equal(legacy.color, '#f00');
  assert.equal(legacy.columns[0].key, 'Active');
});

test('applyConfigEdits: column edits preserve card membership', () => {
  const existing = {
    version: 1,
    vault: { name: 'V' },
    kanban: { columns: [{ key: 'Active', label: 'Active Queue', cards: ['release-x', 'release-y'] }] },
    strategy: { horizons: [] },
  };
  const next = applyConfigEdits(existing, { columns: [{ key: 'Active', label: 'In Progress' }] });
  const active = next.kanban.columns.find((c) => c.key === 'Active');
  assert.equal(active.label, 'In Progress'); // label updated
  assert.deepEqual(active.cards, ['release-x', 'release-y']); // membership preserved
});

// --- End-to-end importer against a fixture vault -------------------------------

function writeCard(dir, name, frontmatter, body = '') {
  const yaml = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n');
  fs.writeFileSync(path.join(dir, name), `---\n${yaml}\n---\n${body}\n`);
}

function makeFixtureVault() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kando-vault-'));
  writeCard(dir, 'release-beta.md', { release: true, status: 'Active', plan_anchor: 'Beta' });
  writeCard(dir, 'release-alpha.md', { release: true, status: 'Active', plan_anchor: 'Alpha' });
  writeCard(dir, 'release-gamma.md', { release: true, status: 'Backlog' });
  writeCard(dir, 'release-shipped.md', { release: true, status: 'Done', shipped_at: '2026-01-01' });
  writeCard(dir, 'initiative-one.md', { release: true, initiative: true, horizon: 'Now', plan_anchor: 'One' });
  writeCard(dir, 'not-a-card.md', { release: false });
  fs.writeFileSync(
    path.join(dir, 'roadmap-index.md'),
    '# Index\n\n## Active Queue\n1. [[release-beta]]\n2. [[release-alpha]]\n\n## Backlog\n- [[release-gamma]]\n'
  );
  return dir;
}

function snapshotMarkdown(dir) {
  const snap = {};
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.md')) snap[f] = fs.readFileSync(path.join(dir, f), 'utf-8');
  }
  return snap;
}

test('importer: writes roadmap.json matching frontmatter + index, leaves Markdown untouched', () => {
  const dir = makeFixtureVault();
  try {
    const before = snapshotMarkdown(dir);
    execFileSync(process.execPath, [IMPORT_SCRIPT, dir], { stdio: 'pipe' });

    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'roadmap.json'), 'utf-8'));
    const byKey = Object.fromEntries(cfg.kanban.columns.map((c) => [c.key, c.cards]));
    assert.deepEqual(byKey.Active, ['release-beta', 'release-alpha']);
    assert.deepEqual(byKey.Backlog, ['release-gamma', 'initiative-one']);
    assert.deepEqual(byKey.Done, ['release-shipped']);
    assert.deepEqual(cfg.strategy.horizons, [{ key: 'Now', initiatives: ['initiative-one'] }]);

    assert.deepEqual(snapshotMarkdown(dir), before, 'Markdown files must be unchanged');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('importer: idempotent — second run produces byte-identical roadmap.json', () => {
  const dir = makeFixtureVault();
  try {
    execFileSync(process.execPath, [IMPORT_SCRIPT, dir], { stdio: 'pipe' });
    const first = fs.readFileSync(path.join(dir, 'roadmap.json'), 'utf-8');
    execFileSync(process.execPath, [IMPORT_SCRIPT, dir], { stdio: 'pipe' });
    const second = fs.readFileSync(path.join(dir, 'roadmap.json'), 'utf-8');
    assert.equal(first, second);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
