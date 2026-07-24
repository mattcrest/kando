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
  placementFromConfig,
  placementParity,
  ordersFromConfig,
  setCardColumn,
  setColumnOrders,
  normalizeStatus,
  normalizeHorizon,
  isArchivedHorizon,
  HORIZON_ORDER,
  strategyPlacementFromConfig,
  setInitiativeHorizon,
  setStrategyOrders,
  strategyParity,
} from '../electron/roadmap-config.js';

const INDEX_ORDERED = ['Active', 'Prioritized', 'Backlog'];

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

test('buildRoadmapConfig: strategy groups initiatives by horizon (all five lanes)', () => {
  const cfg = buildRoadmapConfig({ cards: sampleCards, indexOrders: sampleIndex });
  assert.deepEqual(
    cfg.strategy.horizons.map((h) => h.key),
    HORIZON_ORDER
  );
  assert.deepEqual(cfg.strategy.horizons.find((h) => h.key === 'Now').initiatives, ['initiative-one']);
  assert.deepEqual(cfg.strategy.horizons.find((h) => h.key === 'Past').initiatives, []);
});

test('normalizeHorizon: Past and Future are not coerced to Later', () => {
  assert.equal(normalizeHorizon('Past'), 'Past');
  assert.equal(normalizeHorizon('future'), 'Future');
  assert.equal(normalizeHorizon('Now'), 'Now');
  assert.equal(normalizeHorizon(''), 'Later');
  assert.equal(isArchivedHorizon('Past'), true);
  assert.equal(isArchivedHorizon('Future'), true);
  assert.equal(isArchivedHorizon('Now'), false);
});

test('buildRoadmapConfig: Deferred column appended; Shipped alias folds into Done', () => {
  const cards = [
    { id: 'release-a', status: 'Backlog', title: 'A' },
    { id: 'release-d', status: 'Deferred', title: 'D' },
    { id: 'release-s', status: 'Shipped', shipped_at: '2026-01-01', title: 'S' },
  ];
  const cfg = buildRoadmapConfig({ cards, indexOrders: { Backlog: ['release-a'] } });
  assert.deepEqual(cfg.kanban.columns.map((c) => c.key), ['Done', 'Backlog', 'Deferred']);
  const byKey = Object.fromEntries(cfg.kanban.columns.map((c) => [c.key, c.cards]));
  assert.deepEqual(byKey.Done, ['release-s']);
  assert.deepEqual(byKey.Deferred, ['release-d']);
  assert.deepEqual(byKey.Backlog, ['release-a']);
});

test('buildRoadmapConfig: appends Deferred when existing kanban.json omitted it', () => {
  const existing = {
    name: 'Demo',
    color: '#abc',
    columns: [
      { key: 'Backlog', label: 'Backlog' },
      { key: 'Done', label: 'Shipped' },
    ],
  };
  const cards = [
    { id: 'release-a', status: 'Backlog' },
    { id: 'release-d', status: 'Deferred' },
    { id: 'release-s', status: 'Done' },
  ];
  const cfg = buildRoadmapConfig({ cards, indexOrders: {}, existing });
  assert.deepEqual(cfg.kanban.columns.map((c) => c.key), ['Backlog', 'Done', 'Deferred']);
});

test('normalizeStatus: Shipped aliases to Done', () => {
  assert.equal(normalizeStatus('Shipped'), 'Done');
  assert.equal(normalizeStatus('Done'), 'Done');
  assert.equal(normalizeStatus(''), 'Backlog');
  assert.equal(normalizeStatus(null), 'Backlog');
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

// --- Reader-flip placement + write helpers ------------------------------------

const flipConfig = {
  version: 1,
  kanban: {
    columns: [
      { key: 'Active', label: 'Active Queue', cards: ['release-b', 'release-a'] },
      { key: 'Done', label: 'Shipped', cards: ['release-c'] },
    ],
  },
};

test('placementFromConfig: maps each card to its column + position', () => {
  const p = placementFromConfig(flipConfig);
  assert.deepEqual(p.get('release-a'), { status: 'Active', order: 1 });
  assert.deepEqual(p.get('release-b'), { status: 'Active', order: 0 });
  assert.deepEqual(p.get('release-c'), { status: 'Done', order: 0 });
});

test('ordersFromConfig: one ordered list per column', () => {
  assert.deepEqual(ordersFromConfig(flipConfig), {
    Active: ['release-b', 'release-a'],
    Done: ['release-c'],
  });
});

test('placementParity: agreement yields no diffs', () => {
  const legacy = new Map([
    ['release-b', { status: 'Active', order: 0 }],
    ['release-a', { status: 'Active', order: 1 }],
    ['release-c', { status: 'Done', order: null }],
  ]);
  assert.deepEqual(placementParity(placementFromConfig(flipConfig), legacy, INDEX_ORDERED), []);
});

test('placementParity: flags column and order drift, ignores order on non-index columns', () => {
  const legacy = new Map([
    ['release-b', { status: 'Active', order: 1 }], // order drift (index column)
    ['release-a', { status: 'Backlog', order: 0 }], // column drift
    ['release-c', { status: 'Done', order: 5 }], // order ignored on Done
  ]);
  const diffs = placementParity(placementFromConfig(flipConfig), legacy, INDEX_ORDERED);
  assert.equal(diffs.length, 2);
  assert.ok(diffs.some((d) => d.includes('release-a') && d.includes('column')));
  assert.ok(diffs.some((d) => d.includes('release-b') && d.includes('order')));
  assert.ok(!diffs.some((d) => d.includes('release-c')));
});

test('setCardColumn: moves a card across columns, removing it from the old one', () => {
  const next = setCardColumn(flipConfig, 'release-a', 'Done');
  const p = placementFromConfig(next);
  assert.equal(p.get('release-a').status, 'Done');
  assert.deepEqual(next.kanban.columns.find((c) => c.key === 'Active').cards, ['release-b']);
});

test('setCardColumn: creates the target column when missing', () => {
  const next = setCardColumn(flipConfig, 'release-a', 'Blocked');
  const col = next.kanban.columns.find((c) => c.key === 'Blocked');
  assert.deepEqual(col.cards, ['release-a']);
  assert.equal(col.label, 'Blocked');
});

test('setColumnOrders: replaces named columns and drops moved-away cards', () => {
  const next = setColumnOrders(flipConfig, { Active: ['release-a'] }); // b moved away
  assert.deepEqual(next.kanban.columns.find((c) => c.key === 'Active').cards, ['release-a']);
  assert.deepEqual(next.kanban.columns.find((c) => c.key === 'Done').cards, ['release-c']); // untouched
});

const strategyConfig = {
  version: 1,
  strategy: {
    horizons: [
      { key: 'Now', initiatives: ['initiative-a', 'initiative-b'] },
      { key: 'Next', initiatives: ['initiative-c'] },
    ],
  },
};

test('strategyPlacementFromConfig: maps initiative to horizon + order', () => {
  const p = strategyPlacementFromConfig(strategyConfig);
  assert.deepEqual(p.get('initiative-a'), { horizon: 'Now', order: 0 });
  assert.deepEqual(p.get('initiative-b'), { horizon: 'Now', order: 1 });
  assert.deepEqual(p.get('initiative-c'), { horizon: 'Next', order: 0 });
});

test('setInitiativeHorizon: moves across lanes and creates Past/Future', () => {
  const next = setInitiativeHorizon(strategyConfig, 'initiative-a', 'Past');
  const p = strategyPlacementFromConfig(next);
  assert.equal(p.get('initiative-a').horizon, 'Past');
  assert.deepEqual(
    next.strategy.horizons.find((h) => h.key === 'Now').initiatives,
    ['initiative-b']
  );
  assert.ok(next.strategy.horizons.some((h) => h.key === 'Future'));
});

test('setStrategyOrders: replaces named lanes and ensures all five keys', () => {
  const next = setStrategyOrders(strategyConfig, {
    Now: ['initiative-b'],
    Past: ['initiative-a'],
  });
  assert.deepEqual(next.strategy.horizons.map((h) => h.key), HORIZON_ORDER);
  assert.deepEqual(next.strategy.horizons.find((h) => h.key === 'Now').initiatives, ['initiative-b']);
  assert.deepEqual(next.strategy.horizons.find((h) => h.key === 'Past').initiatives, ['initiative-a']);
  assert.deepEqual(next.strategy.horizons.find((h) => h.key === 'Next').initiatives, ['initiative-c']);
});

test('strategyParity: flags horizon drift', () => {
  const legacy = new Map([
    ['initiative-a', { horizon: 'Next', order: 0 }],
    ['initiative-b', { horizon: 'Now', order: 1 }],
  ]);
  const diffs = strategyParity(strategyPlacementFromConfig(strategyConfig), legacy);
  assert.ok(diffs.some((d) => d.includes('initiative-a') && d.includes('horizon')));
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
    assert.deepEqual(
      cfg.strategy.horizons.map((h) => h.key),
      ['Now', 'Next', 'Later', 'Past', 'Future']
    );
    assert.deepEqual(cfg.strategy.horizons.find((h) => h.key === 'Now').initiatives, ['initiative-one']);

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
