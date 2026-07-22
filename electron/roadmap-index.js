import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

const WIKI_LINK_RE = /\[\[(release-[^\]|]+)(?:\|[^\]]*)?\]\]/;

/** Map ## heading text to kanban status keys. */
export function headerToStatus(header) {
  const h = header.toLowerCase();
  if (h.includes('active queue') || h === 'active') return 'Active';
  if (h.includes('prioritized')) return 'Prioritized';
  if (h.includes('backlog')) return 'Backlog';
  if (h.includes('shipped')) return 'Done';
  if (h.includes('deferred')) return 'Deferred';
  if (h.includes('blocked')) return 'Blocked';
  return null;
}

export function normalizeCardId(slug) {
  const trimmed = (slug || '').trim();
  return trimmed.startsWith('release-') ? trimmed : `release-${trimmed}`;
}

/**
 * Parse roadmap-index.md into section structure and per-status card order.
 * @returns {{ frontmatter: object, preamble: string[], sections: object[], orders: Record<string, string[]> }}
 */
export function parseRoadmapIndex(raw) {
  const { data: frontmatter, content: body } = matter(raw);
  const preamble = [];
  const sections = [];
  let current = null;

  for (const line of body.split('\n')) {
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      if (current) sections.push(current);
      current = {
        headerLine: line,
        status: headerToStatus(h2[1].trim()),
        lines: [],
        items: [],
      };
      continue;
    }

    if (!current) {
      preamble.push(line);
      continue;
    }

    current.lines.push(line);
    const wiki = line.match(WIKI_LINK_RE);
    if (wiki) {
      current.items.push({ cardId: normalizeCardId(wiki[1]), line });
    }
  }
  if (current) sections.push(current);

  const orders = {};
  for (const section of sections) {
    if (!section.status) continue;
    if (!orders[section.status]) orders[section.status] = [];
    for (const item of section.items) {
      if (!orders[section.status].includes(item.cardId)) {
        orders[section.status].push(item.cardId);
      }
    }
  }

  return { frontmatter, preamble, sections, orders };
}

function rebuildSectionLines(section, orderedCardIds) {
  const lineById = new Map(section.items.map((i) => [i.cardId, i.line]));
  const lines = section.lines;
  let firstWiki = -1;
  let lastWiki = -1;

  lines.forEach((line, i) => {
    if (WIKI_LINK_RE.test(line)) {
      if (firstWiki === -1) firstWiki = i;
      lastWiki = i;
    }
  });

  const before = firstWiki === -1 ? lines : lines.slice(0, firstWiki);
  const after = firstWiki === -1 ? [] : lines.slice(lastWiki + 1);
  const isNumbered =
    section.items.some((i) => /^\s*\d+\./.test(i.line)) ||
    (section.status !== 'Backlog' && orderedCardIds.length > 0);

  const newListLines = orderedCardIds.map((id, idx) => {
    if (lineById.has(id)) {
      const existing = lineById.get(id);
      if (isNumbered) return existing.replace(/^\s*\d+\./, `${idx + 1}.`);
      return existing;
    }
    const prefix = isNumbered ? `${idx + 1}. ` : '- ';
    return `${prefix}[[${id}]]`;
  });

  if (firstWiki === -1 && orderedCardIds.length > 0) {
    return [...before, ...newListLines, ...after];
  }

  return [...before, ...newListLines, ...after];
}

/**
 * Apply new card order to one or more index sections and return updated markdown.
 * @param {string} raw - existing file content
 * @param {Record<string, string[]>} sectionOrders - status -> ordered card ids
 */
export function applyIndexSectionOrders(raw, sectionOrders) {
  const parsed = parseRoadmapIndex(raw);

  for (const section of parsed.sections) {
    if (!section.status || !(section.status in sectionOrders)) continue;
    section.lines = rebuildSectionLines(section, sectionOrders[section.status]);
    section.items = section.lines
      .filter((line) => WIKI_LINK_RE.test(line))
      .map((line) => {
        const wiki = line.match(WIKI_LINK_RE);
        return { cardId: normalizeCardId(wiki[1]), line };
      });
  }

  const bodyParts = [...parsed.preamble];
  for (const section of parsed.sections) {
    bodyParts.push(section.headerLine, ...section.lines);
  }

  return matter.stringify(bodyParts.join('\n'), parsed.frontmatter);
}

/** Status columns whose order comes from roadmap-index.md. */
export const INDEX_ORDERED_STATUSES = ['Active', 'Prioritized', 'Backlog'];

export async function readIndexFile(indexPath) {
  try {
    return await fs.readFile(indexPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function loadIndexOrders(indexPath) {
  const raw = await readIndexFile(indexPath);
  if (!raw) return null;
  const { orders } = parseRoadmapIndex(raw);
  return orders;
}

/**
 * Positional lookup: { Active: { 'release-x': 0, ... }, ... }
 */
export function ordersToPositionMaps(orders) {
  const maps = {};
  for (const [status, ids] of Object.entries(orders || {})) {
    maps[status] = {};
    ids.forEach((id, i) => {
      maps[status][id] = i;
    });
  }
  return maps;
}

export async function updateIndexSections(indexPath, sectionOrders) {
  const raw = await readIndexFile(indexPath);
  if (!raw) {
    throw new Error(`roadmap index not found: ${indexPath}`);
  }
  const updated = applyIndexSectionOrders(raw, sectionOrders);
  await fs.writeFile(indexPath, updated, 'utf-8');
  return updated;
}

export function defaultIndexPath(vaultDir, indexFile = 'roadmap-index.md') {
  return path.join(vaultDir, indexFile);
}
