/**
 * Epic wave planning — groups an epic's story slices into sequenced "waves".
 *
 * Loaded as a classic <script> in app.html and as a plain module in tests, so it
 * attaches to globalThis instead of using exports.
 *
 * A slice's wave comes from, in order:
 *   1. its `wave:` frontmatter (positive integer, or "Wave 2" / "w2"), then
 *   2. its `## Dependencies` — one wave after the latest in-epic slice it depends on.
 * Slices with neither are "unscheduled".
 */
(function (root) {
  'use strict';

  /** Positive-integer wave from frontmatter, or null when absent/unusable. */
  function normalizeWave(value) {
    if (typeof value === 'number') {
      return Number.isInteger(value) && value > 0 ? value : null;
    }
    if (typeof value !== 'string') return null;
    const m = value.trim().match(/^(?:wave\s*|w)?(\d+)$/i);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n > 0 ? n : null;
  }

  /**
   * @param {Array<{id: string, wave?: *, deps?: string[]}>} slices
   * @returns {{
   *   waves: Array<{ number: number, slices: object[] }>,
   *   unscheduled: object[],
   *   bySlice: Record<string, { wave: number|null, source: 'explicit'|'derived'|null }>,
   *   mode: 'explicit'|'derived'|'none',
   *   total: number,
   * }}
   */
  function computeEpicWaves(slices) {
    const list = Array.isArray(slices) ? slices : [];
    const ids = new Set(list.map((s) => s.id));
    const inEpicDeps = new Map(
      list.map((s) => [
        s.id,
        Array.from(new Set((s.deps || []).filter((d) => d !== s.id && ids.has(d)))),
      ])
    );
    const explicit = new Map();
    for (const s of list) {
      const w = normalizeWave(s.wave);
      if (w != null) explicit.set(s.id, w);
    }
    const hasEdges = Array.from(inEpicDeps.values()).some((d) => d.length > 0);

    const resolved = new Map();
    const visiting = new Set();

    function resolve(id) {
      if (resolved.has(id)) return resolved.get(id);
      if (explicit.has(id)) {
        const r = { wave: explicit.get(id), source: 'explicit' };
        resolved.set(id, r);
        return r;
      }
      const deps = inEpicDeps.get(id) || [];
      if (!deps.length) {
        const r =
          explicit.size > 0 || !hasEdges
            ? { wave: null, source: null }
            : { wave: 1, source: 'derived' };
        resolved.set(id, r);
        return r;
      }
      if (visiting.has(id)) return { wave: null, source: null };
      visiting.add(id);
      let latest = 0;
      for (const d of deps) {
        const dep = resolve(d);
        if (dep.wave != null) latest = Math.max(latest, dep.wave);
      }
      visiting.delete(id);
      const r = { wave: latest + 1, source: 'derived' };
      resolved.set(id, r);
      return r;
    }

    const bySlice = {};
    const buckets = new Map();
    const unscheduled = [];
    for (const s of list) {
      const r = resolve(s.id);
      bySlice[s.id] = r;
      if (r.wave == null) {
        unscheduled.push(s);
        continue;
      }
      if (!buckets.has(r.wave)) buckets.set(r.wave, []);
      buckets.get(r.wave).push(s);
    }

    const waves = Array.from(buckets.keys())
      .sort((a, b) => a - b)
      .map((number) => ({ number, slices: buckets.get(number) }));

    const mode = explicit.size > 0 ? 'explicit' : waves.length > 0 ? 'derived' : 'none';
    return { waves, unscheduled, bySlice, mode, total: list.length };
  }

  root.KandoEpicWaves = { normalizeWave, computeEpicWaves };
})(typeof globalThis !== 'undefined' ? globalThis : window);
