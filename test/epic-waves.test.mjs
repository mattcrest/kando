import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import '../electron/epic-waves.js';

const { normalizeWave, computeEpicWaves } = globalThis.KandoEpicWaves;

const ids = (slices) => slices.map((s) => s.id);

describe('normalizeWave', () => {
  it('accepts positive integers and wave-ish strings', () => {
    assert.equal(normalizeWave(2), 2);
    assert.equal(normalizeWave('3'), 3);
    assert.equal(normalizeWave('Wave 4'), 4);
    assert.equal(normalizeWave('w5'), 5);
  });

  it('rejects everything else', () => {
    for (const v of [0, -1, 1.5, '', 'soon', null, undefined, true, {}]) {
      assert.equal(normalizeWave(v), null, String(v));
    }
  });
});

describe('computeEpicWaves', () => {
  it('uses explicit wave frontmatter, sorted ascending', () => {
    const res = computeEpicWaves([
      { id: 'c', wave: 2 },
      { id: 'a', wave: 1 },
      { id: 'b', wave: '1' },
    ]);
    assert.equal(res.mode, 'explicit');
    assert.deepEqual(res.waves.map((w) => w.number), [1, 2]);
    assert.deepEqual(ids(res.waves[0].slices), ['a', 'b']);
    assert.deepEqual(ids(res.waves[1].slices), ['c']);
    assert.equal(res.unscheduled.length, 0);
    assert.equal(res.bySlice.a.source, 'explicit');
  });

  it('derives waves from in-epic dependencies when none are explicit', () => {
    const res = computeEpicWaves([
      { id: 'a' },
      { id: 'b', deps: ['a'] },
      { id: 'c', deps: ['a', 'b'] },
      { id: 'd' },
    ]);
    assert.equal(res.mode, 'derived');
    assert.deepEqual(ids(res.waves[0].slices), ['a', 'd']);
    assert.deepEqual(ids(res.waves[1].slices), ['b']);
    assert.deepEqual(ids(res.waves[2].slices), ['c']);
    assert.equal(res.bySlice.c.source, 'derived');
  });

  it('ignores dependencies outside the epic and self references', () => {
    const res = computeEpicWaves([
      { id: 'a', deps: ['elsewhere', 'a'] },
      { id: 'b', deps: ['a'] },
    ]);
    assert.deepEqual(res.waves.map((w) => w.number), [1, 2]);
  });

  it('leaves everything unscheduled when there is no wave or dependency info', () => {
    const res = computeEpicWaves([{ id: 'a' }, { id: 'b' }]);
    assert.equal(res.mode, 'none');
    assert.equal(res.waves.length, 0);
    assert.deepEqual(ids(res.unscheduled), ['a', 'b']);
  });

  it('leaves unmarked slices unscheduled when others carry explicit waves', () => {
    const res = computeEpicWaves([{ id: 'a', wave: 1 }, { id: 'b' }]);
    assert.deepEqual(ids(res.unscheduled), ['b']);
  });

  it('places an unmarked slice after the waves of its dependencies', () => {
    const res = computeEpicWaves([
      { id: 'a', wave: 2 },
      { id: 'b', deps: ['a'] },
    ]);
    assert.equal(res.bySlice.b.wave, 3);
    assert.equal(res.bySlice.b.source, 'derived');
  });

  it('terminates on dependency cycles', () => {
    const res = computeEpicWaves([
      { id: 'a', deps: ['b'] },
      { id: 'b', deps: ['a'] },
    ]);
    assert.equal(res.total, 2);
    assert.equal(res.waves.flatMap((w) => w.slices).length, 2);
  });

  it('treats invalid wave values as unassigned', () => {
    const res = computeEpicWaves([{ id: 'a', wave: 'soon' }, { id: 'b', wave: 1 }]);
    assert.deepEqual(ids(res.unscheduled), ['a']);
  });

  it('handles empty input', () => {
    const res = computeEpicWaves([]);
    assert.equal(res.total, 0);
    assert.equal(res.mode, 'none');
  });
});
