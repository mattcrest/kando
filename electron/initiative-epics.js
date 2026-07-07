/**
 * Parse and rewrite the ## Epics table in initiative markdown notes.
 */

const EPICS_SECTION_RE = /^## Epics\r?\n([\s\S]*?)(?=\r?\n## |\r?\n$)/m;

function parseTableRow(line) {
  if (!/^\|/.test(line) || /^\|[\s\-:|]+\|$/.test(line.replace(/\s/g, ''))) return null;
  const cells = line
    .split('|')
    .map((s) => s.trim())
    .filter((_, i, arr) => i > 0 && i < arr.length - 1);
  if (!cells.length) return null;
  const wiki = (cells[0] || '').match(/\[\[([^\]|]+)/);
  if (!wiki) return null;
  return {
    id: wiki[1],
    status: cells[1] || '',
    notes: cells[2] || '',
  };
}

export function parseInitiativeEpics(content) {
  const match = content.match(EPICS_SECTION_RE);
  if (!match) return [];
  const rows = [];
  for (const line of match[1].split(/\r?\n/)) {
    const row = parseTableRow(line);
    if (row) rows.push(row);
  }
  return rows;
}

export function buildEpicsSection(rows) {
  const lines = [
    '## Epics',
    '',
    '| Epic | Status | Notes |',
    '|------|--------|-------|',
    ...rows.map((r) => `| [[${r.id}]] | ${r.status} | ${r.notes} |`),
    '',
  ];
  return lines.join('\n');
}

export function replaceInitiativeEpics(content, rows) {
  const section = buildEpicsSection(rows);
  if (EPICS_SECTION_RE.test(content)) {
    return content.replace(EPICS_SECTION_RE, `${section}\n`);
  }
  const insertBefore = content.match(/\r?\n## Initiative acceptance criteria/);
  if (insertBefore) {
    const idx = insertBefore.index;
    return `${content.slice(0, idx)}\n\n${section}\n${content.slice(idx)}`;
  }
  return `${content.trimEnd()}\n\n${section}\n`;
}

export function stripEpicsSection(content) {
  return content.replace(EPICS_SECTION_RE, '').replace(/\n{3,}/g, '\n\n').trimEnd();
}
