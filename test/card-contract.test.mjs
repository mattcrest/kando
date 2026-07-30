import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCardIdentity,
  validateCard,
  vaultDoctor,
  cardContract,
  scanConventionsDrift,
  inferCardKind,
} from '../electron/card-contract.js';

describe('card-contract', () => {
  it('parses Venubase-style initiative', () => {
    const data = {
      release: true,
      initiative: true,
      plan_anchor: 'Launch-ready venue',
      horizon: 'Now',
    };
    const identity = parseCardIdentity(data, 'initiative-launch-ready-venue', 'initiative-launch-ready-venue.md');
    assert.equal(identity.is_initiative, true);
    assert.equal(identity.is_epic, false);
    assert.equal(identity.title, 'Launch-ready venue');
    assert.equal(identity.contract_warnings.length, 0);
  });

  it('rejects kind/title dialect', () => {
    const data = {
      release: true,
      kind: 'initiative',
      title: 'Ship iOS',
    };
    const identity = parseCardIdentity(data, 'initiative-ship-ios', 'initiative-ship-ios.md');
    const fields = identity.contract_warnings.map((w) => w.field);
    assert.ok(fields.includes('kind'));
    assert.ok(fields.includes('title'));
    assert.ok(fields.includes('plan_anchor'));
    assert.ok(fields.includes('initiative'));
  });

  it('validates epic parent link', () => {
    const result = validateCard({
      cardId: 'release-epic-foo',
      filename: 'release-epic-foo.md',
      frontmatter: {
        release: true,
        epic: true,
        plan_anchor: 'Foo epic',
      },
      content: '## Summary\n\nTest.\n',
      context: {
        storage: 'roadmap-json',
        columnKeys: ['Backlog'],
        cardIds: new Set(['release-epic-foo']),
        placedCardIds: new Set(['release-epic-foo']),
        strategyInitiativeIds: new Set(),
      },
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.field === 'initiative'));
  });

  it('flags conventions drift for kind documentation', () => {
    const issues = scanConventionsDrift('Frontmatter carries `kind` and `title` fields.');
    assert.ok(issues.length >= 1);
    assert.ok(issues.some((i) => i.category === 'conventions_drift'));
  });

  it('doctor reports unreadable initiatives', () => {
    const report = vaultDoctor({
      vaultKey: 'test',
      vaultDir: '/tmp',
      cards: [
        {
          id: 'initiative-broken',
          title: 'Broken',
          is_initiative: true,
          is_epic: false,
          contract_warnings: [
            { severity: 'error', field: 'kind', message: 'Rejected', fix: 'Use initiative: true' },
          ],
        },
      ],
      markdownFiles: [],
      conventionsText: '',
      storage: 'roadmap-json',
      columnKeys: [],
      placementDiffs: [],
      strategyDiffs: [],
      placedCardIds: new Set(),
      strategyInitiativeIds: new Set(),
      roadmapJsonIds: new Set(),
    });
    assert.equal(report.summary.unreadableInitiatives, 1);
    assert.equal(report.ok, false);
  });

  it('serializes card contract', () => {
    const contract = cardContract({
      vaultKey: 'venubase',
      storage: 'frontmatter-index',
      columnKeys: ['Backlog', 'Active'],
      templates: { slice: '---\n' },
    });
    assert.equal(contract.titleField, 'plan_anchor');
    assert.ok(contract.rejectedFields.kind);
    assert.deepEqual(contract.horizons, ['Now', 'Next', 'Later', 'Past', 'Future']);
  });

  it('infers kind from filename when markers missing', () => {
    assert.equal(inferCardKind({ release: true }, 'initiative-foo.md'), 'initiative');
    assert.equal(inferCardKind({ release: true, epic: true }, 'release-epic-bar.md'), 'epic');
    assert.equal(inferCardKind({ release: true }, 'release-baz.md'), 'slice');
  });
});
