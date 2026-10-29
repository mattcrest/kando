/**
 * Group an epic's story slices into waves for the epic card chart.
 *
 * Wave membership comes from the ## Story slices section, in this order:
 * 1. Notes that start with "Post–Wave", "After wave", or "Later" → Later
 * 2. Notes that start with "Wave N" (optional letter, e.g. 1a)
 * 3. The nearest preceding ### Wave N heading, which also supplies the row title
 * 4. Otherwise the slice is not in a wave
 *
 * A "Wave N" mention later in a note does not assign the slice.
 */

const STORY_SLICES_RE = /(?:^|\r?\n)## Story slices[^\n]*\r?\n([\s\S]*?)(?=\r?\n## |$)/;
const NOTES_LATER_RE = /^(?:post[\s\-–—]*wave|after\s+wave|later)\b/i;
const NOTES_WAVE_RE = /^wave\s+(\d+[a-z]?)\b/i;
const HEADING_WAVE_RE = /^wave\s+(\d+[a-z]?)\b(?:\s*[—–:\-]\s*(.*?))?\s*$/i;

export function normalizeCardId(raw) {
  const slug = String(raw || '').trim().split('|')[0].trim();
  if (!slug) return '';
  return slug.startsWith('release-') ? slug : `release-${slug}`;
}

function plain(text) {
  return String(text || '')
    .replace(/\*\*/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function parseCells(line) {
  if (!/^\|/.test(line) || /^\|[\s\-:|]+\|$/.test(line.replace(/\s/g, ''))) return null;
  const cells = line
    .split('|')
    .map((s) => s.trim())
    .filter((_, i, arr) => i > 0 && i < arr.length - 1);
  return cells.length ? cells : null;
}

function rowFromLine(line) {
  const cells = parseCells(line);
  if (!cells) return null;
  let wikiIdx = -1;
  let id = '';
  for (let i = 0; i < cells.length; i++) {
    const wiki = cells[i].match(/\[\[([^\]|]+)/);
    if (wiki) {
      wikiIdx = i;
      id = normalizeCardId(wiki[1]);
      break;
    }
  }
  if (!id) return null;
  const notes = wikiIdx < cells.length - 1 ? cells[cells.length - 1] : '';
  return { id, notes };
}

function waveFromNotes(notes) {
  const text = plain(notes);
  if (!text) return null;
  if (NOTES_LATER_RE.test(text)) return { key: 'later' };
  const match = text.match(NOTES_WAVE_RE);
  if (!match) return null;
  return { key: match[1].toLowerCase() };
}

function waveFromHeading(line) {
  const text = plain(line.replace(/^#{1,6}\s+/, ''));
  const match = text.match(HEADING_WAVE_RE);
  if (!match) return null;
  return { key: match[1].toLowerCase(), title: (match[2] || '').trim() };
}

function parseSliceWaves(content) {
  const match = String(content || '').match(STORY_SLICES_RE);
  if (!match) return [];
  const rows = [];
  let current = null;
  for (const line of match[1].split(/\r?\n/)) {
    if (/^#{3,6}\s+/.test(line)) {
      current = waveFromHeading(line);
      continue;
    }
    const row = rowFromLine(line);
    if (!row) continue;
    const fromNotes = waveFromNotes(row.notes);
    let key = 'unassigned';
    let title = '';
    if (fromNotes) {
      key = fromNotes.key;
      if (key !== 'later' && current && current.key === key) title = current.title || '';
    } else if (current) {
      key = current.key;
      title = current.title || '';
    }
    rows.push({ id: row.id, key, title });
  }
  return rows;
}

function compareWaveKeys(a, b) {
  const rank = (key) => {
    if (key === 'slices') return [3, 0, ''];
    if (key === 'unassigned') return [2, 0, ''];
    if (key === 'later') return [1, 0, ''];
    const match = /^(\d+)([a-z]*)$/.exec(key);
    if (!match) return [0, 9999, key];
    return [0, Number(match[1]), match[2]];
  };
  const left = rank(a);
  const right = rank(b);
  if (left[0] !== right[0]) return left[0] - right[0];
  if (left[1] !== right[1]) return left[1] - right[1];
  if (left[2] < right[2]) return -1;
  if (left[2] > right[2]) return 1;
  return 0;
}

function labelFor(key) {
  if (key === 'later') return 'Later';
  if (key === 'unassigned') return 'Not in a wave';
  if (key === 'slices') return 'Slices';
  return `Wave ${key}`;
}

/**
 * @param {string} content Epic markdown
 * @param {string[]} sliceIds Child slice ids, in fallback order
 * @returns {{ total: number, waveCount: number, groups: { key: string, label: string, title: string, ids: string[] }[] }}
 */
export function groupEpicSlices(content, sliceIds) {
  const wanted = [];
  const seen = new Set();
  const originalByNorm = new Map();
  for (const raw of sliceIds || []) {
    const norm = normalizeCardId(raw);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    wanted.push(norm);
    originalByNorm.set(norm, String(raw));
  }

  const keyById = new Map();
  const tableIndex = new Map();
  const titleByKey = new Map();
  let index = 0;
  for (const row of parseSliceWaves(content)) {
    if (!seen.has(row.id) || keyById.has(row.id)) continue;
    keyById.set(row.id, row.key);
    tableIndex.set(row.id, index++);
    if (row.title && !titleByKey.has(row.key)) titleByKey.set(row.key, row.title);
  }

  const buckets = new Map();
  for (const id of wanted) {
    const key = keyById.get(id) || 'unassigned';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(id);
  }
  for (const ids of buckets.values()) {
    ids.sort((a, b) => {
      const ai = tableIndex.has(a) ? tableIndex.get(a) : 1_000_000;
      const bi = tableIndex.has(b) ? tableIndex.get(b) : 1_000_000;
      if (ai !== bi) return ai - bi;
      return wanted.indexOf(a) - wanted.indexOf(b);
    });
  }

  const keys = [...buckets.keys()];
  if (!keys.some((key) => key !== 'unassigned')) {
    const ids = (buckets.get('unassigned') || []).map((id) => originalByNorm.get(id));
    return {
      total: ids.length,
      waveCount: 0,
      groups: ids.length ? [{ key: 'slices', label: 'Slices', title: '', ids }] : [],
    };
  }

  const orderedKeys = keys.sort(compareWaveKeys);
  const groups = orderedKeys.map((key) => ({
    key,
    label: labelFor(key),
    title: titleByKey.get(key) || '',
    ids: buckets.get(key).map((id) => originalByNorm.get(id)),
  }));
  return {
    total: wanted.length,
    waveCount: orderedKeys.filter((key) => /^\d/.test(key)).length,
    groups,
  };
}
