import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isOnBench, benchCardsFrom } from '../electron/workbench.js';

describe('workbench membership', () => {
  it('includes Active slices even without agent fields', () => {
    assert.equal(isOnBench({ id: 'release-foo', status: 'Active' }), true);
  });

  it('includes Backlog slices that still have agent_status', () => {
    assert.equal(
      isOnBench({ id: 'release-foo', status: 'Backlog', agent_status: 'in_progress' }),
      true
    );
  });

  it('excludes Done slices even when leftover agent_status remains', () => {
    assert.equal(
      isOnBench({
        id: 'release-foo',
        status: 'Done',
        agent_status: 'idle',
        agent_summary: 'Shipped via #123',
      }),
      false
    );
  });

  it('excludes Deferred slices with leftover agent fields', () => {
    assert.equal(
      isOnBench({ id: 'release-foo', status: 'Deferred', agent_status: 'blocked' }),
      false
    );
  });

  it('excludes epics and initiatives even when Active', () => {
    assert.equal(isOnBench({ id: 'release-epic-foo', status: 'Active', is_epic: true }), false);
    assert.equal(
      isOnBench({ id: 'initiative-foo', status: 'Active', is_initiative: true }),
      false
    );
  });

  it('filters a mixed list down to in-flight slices', () => {
    const cards = [
      { id: 'release-done', status: 'Done', agent_status: 'idle' },
      { id: 'release-active', status: 'Active' },
      { id: 'release-epic-x', status: 'Active', is_epic: true },
      { id: 'release-idle-backlog', status: 'Backlog' },
    ];
    assert.deepEqual(
      benchCardsFrom(cards).map((c) => c.id),
      ['release-active']
    );
  });
});
