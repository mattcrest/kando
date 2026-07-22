import fs from 'fs/promises';
import path from 'path';

/**
 * roadmap.json — the source of truth for card *organization* (columns, order,
 * strategy lanes). Card Markdown stays the source of truth for *content*.
 * See docs/roadmap-json.md for the design and guardrails.
 *
 * This module owns the schema: loading (with kanban.json rename fallback),
 * normalizing old/new shapes, and building a fresh config from a vault's
 * current frontmatter + roadmap-index.md order (the importer core). It does
 * NOT flip the board read path and never writes to card Markdown.
 */

export const ROADMAP_SCHEMA_VERSION = 1;

export const ROADMAP_FILENAME = 'roadmap.json';
export const LEGACY_FILENAME = 'kanban.json';

/** Kanban status key -> human column label (mirrors the UI's STATUS_LABELS). */
export const STATUS_LABELS = {
  Done: 'Shipped',
  Active: 'Active Queue',
  Prioritized: 'Prioritized',
  Backlog: 'Backlog',
  Blocked: 'Blocked',
};

/** Column order the UI falls back to when no explicit column list exists. */
export const DEFAULT_COLUMN_ORDER = ['Done', 'Active', 'Prioritized', 'Backlog', 'Blocked'];

/** Statuses whose order comes from roadmap-index.md wiki-link position. */
const INDEX_ORDERED = new Set(['Active', 'Prioritized', 'Backlog']);

const HORIZON_ORDER = ['Now', 'Next', 'Later'];

/** Strategy-lane sort rank by status (mirrors the UI's statusOrder). */
const STRATEGY_STATUS_RANK = { Active: 0, Prioritized: 1, Backlog: 2, Blocked: 3, Done: 4, Deferred: 5 };

/** Top-level keys the schema owns; anything else is an unknown section to preserve. */
const KNOWN_TOP_KEYS = new Set(['version', 'vault', 'kanban', 'strategy']);
/** Keys used only by the legacy kanban.json shape. */
const LEGACY_TOP_KEYS = new Set(['name', 'color', 'columns', 'settings']);

export function normalizeHorizon(horizon) {
  const s = String(horizon || '').trim();
  if (/^now/i.test(s)) return 'Now';
  if (/^next/i.test(s)) return 'Next';
  return 'Later';
}

/**
 * Coerce either the new roadmap.json shape or the legacy kanban.json shape
 * ({ name, color, columns, settings }) into the canonical in-memory shape.
 * Unknown top-level sections are carried through untouched (guardrail 4).
 */
export function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const isNewShape =
    raw.version !== undefined || raw.vault !== undefined || raw.kanban !== undefined || raw.strategy !== undefined;

  if (isNewShape) {
    const passthrough = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!KNOWN_TOP_KEYS.has(k)) passthrough[k] = v;
    }
    return {
      version: raw.version ?? ROADMAP_SCHEMA_VERSION,
      vault: raw.vault ?? {},
      kanban: raw.kanban ?? { columns: [] },
      strategy: raw.strategy ?? { horizons: [] },
      ...passthrough,
    };
  }

  // Legacy kanban.json: { name, color, columns, settings }
  const passthrough = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!LEGACY_TOP_KEYS.has(k)) passthrough[k] = v;
  }
  const normalized = {
    version: ROADMAP_SCHEMA_VERSION,
    vault: cleanVault({ name: raw.name, color: raw.color }),
    kanban: { columns: raw.columns ?? [] },
    strategy: { horizons: [] },
    ...passthrough,
  };
  if (raw.settings !== undefined) normalized.settings = raw.settings;
  return normalized;
}

/**
 * Flatten a normalized config to the legacy shape the current server/UI
 * consumers expect (`.name`, `.color`, `.columns`). Keeps the board working
 * unchanged while roadmap.json read support lands.
 */
export function toLegacyConfig(normalized) {
  if (!normalized) return null;
  return {
    ...normalized,
    name: normalized.vault?.name,
    color: normalized.vault?.color,
    columns: normalized.kanban?.columns ?? [],
  };
}

/** Drop empty vault fields so we don't serialize `{ name: undefined }`. */
function cleanVault(vault) {
  const out = {};
  if (vault?.name) out.name = vault.name;
  if (vault?.color) out.color = vault.color;
  return out;
}

function orderCardIdsForStatus(status, cards, indexOrders) {
  const inStatus = cards.filter((c) => (c.status || 'Backlog') === status);

  if (INDEX_ORDERED.has(status)) {
    const order = indexOrders?.[status] || [];
    const pos = new Map(order.map((id, i) => [id, i]));
    return inStatus
      .slice()
      .sort((a, b) => {
        const ap = pos.has(a.id) ? pos.get(a.id) : Infinity;
        const bp = pos.has(b.id) ? pos.get(b.id) : Infinity;
        if (ap !== bp) return ap - bp;
        const ar = a.roadmap_order ?? Infinity;
        const br = b.roadmap_order ?? Infinity;
        if (ar !== br) return ar - br;
        return a.id.localeCompare(b.id);
      })
      .map((c) => c.id);
  }

  if (status === 'Done') {
    return inStatus
      .slice()
      .sort((a, b) => new Date(b.shipped_at || 0) - new Date(a.shipped_at || 0) || a.id.localeCompare(b.id))
      .map((c) => c.id);
  }

  return inStatus
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => c.id);
}

/**
 * Build a fresh roadmap.json (new shape) from a vault's current cards +
 * roadmap-index.md order. Pure: takes data, returns an object. This is the
 * importer core.
 *
 * @param {object}   opts
 * @param {Array}    opts.cards        card metadata: { id, status, roadmap_order, shipped_at, is_initiative, horizon, title }
 * @param {object}   opts.indexOrders  { Active: [ids], Prioritized: [...], Backlog: [...] }
 * @param {object?}  opts.existing     existing roadmap.json/kanban.json to preserve meta, labels, and unknown sections
 */
export function buildRoadmapConfig({ cards = [], indexOrders = {}, existing = null } = {}) {
  const existingCfg = existing ? normalizeConfig(existing) : null;
  const presentStatuses = new Set(cards.map((c) => c.status || 'Backlog'));

  // Column definitions: preserve existing order + labels; append any newly
  // present statuses in default order.
  let columnDefs;
  const existingCols = existingCfg?.kanban?.columns;
  if (existingCols && existingCols.length) {
    columnDefs = existingCols.map((c) => ({ key: c.key, label: c.label || STATUS_LABELS[c.key] || c.key }));
    for (const s of DEFAULT_COLUMN_ORDER) {
      if (presentStatuses.has(s) && !columnDefs.some((c) => c.key === s)) {
        columnDefs.push({ key: s, label: STATUS_LABELS[s] || s });
      }
    }
  } else {
    columnDefs = DEFAULT_COLUMN_ORDER
      .filter((s) => presentStatuses.has(s))
      .map((s) => ({ key: s, label: STATUS_LABELS[s] || s }));
  }

  const columns = columnDefs.map((def) => ({
    key: def.key,
    label: def.label,
    cards: orderCardIdsForStatus(def.key, cards, indexOrders),
  }));

  const initiatives = cards.filter((c) => c.is_initiative);
  const horizons = HORIZON_ORDER.map((key) => ({
    key,
    initiatives: initiatives
      .filter((c) => normalizeHorizon(c.horizon) === key)
      .sort(
        (a, b) =>
          (STRATEGY_STATUS_RANK[a.status] ?? 9) - (STRATEGY_STATUS_RANK[b.status] ?? 9) ||
          (a.title || '').localeCompare(b.title || '')
      )
      .map((c) => c.id),
  })).filter((h) => h.initiatives.length > 0);

  const config = {
    version: ROADMAP_SCHEMA_VERSION,
    vault: cleanVault(existingCfg?.vault),
    kanban: { columns },
    strategy: { horizons },
  };

  // Preserve unknown top-level sections from the existing file (guardrail 4).
  if (existingCfg) {
    for (const [k, v] of Object.entries(existingCfg)) {
      if (!KNOWN_TOP_KEYS.has(k) && !(k in config)) config[k] = v;
    }
  }

  return config;
}

/**
 * Apply column-definition / settings edits (from the config PUT endpoint) onto
 * an existing config, preserving each column's card membership and any unknown
 * sections. Returns a new-shape object ready to serialize.
 */
export function applyConfigEdits(existingRaw, edits = {}) {
  const base = normalizeConfig(existingRaw) || {
    version: ROADMAP_SCHEMA_VERSION,
    vault: {},
    kanban: { columns: [] },
    strategy: { horizons: [] },
  };
  const cardsByKey = new Map((base.kanban?.columns || []).map((c) => [c.key, c.cards || []]));

  const out = { ...base };
  out.version = base.version ?? ROADMAP_SCHEMA_VERSION;
  out.vault = cleanVault(base.vault);
  if (edits.columns) {
    out.kanban = {
      ...base.kanban,
      columns: edits.columns.map((c) => ({
        key: c.key,
        label: c.label,
        cards: c.cards ?? cardsByKey.get(c.key) ?? [],
      })),
    };
  }
  out.strategy = base.strategy ?? { horizons: [] };
  if (edits.settings) out.settings = { ...(base.settings || {}), ...edits.settings };
  return out;
}

function emptyConfig() {
  return { version: ROADMAP_SCHEMA_VERSION, vault: {}, kanban: { columns: [] }, strategy: { horizons: [] } };
}

/**
 * Placement map derived from a config: cardId -> { status, order }, where status
 * is the column key holding the card and order is its index within that column.
 * First occurrence wins if a card is (wrongly) listed twice.
 */
export function placementFromConfig(raw) {
  const cfg = normalizeConfig(raw);
  const map = new Map();
  for (const col of cfg?.kanban?.columns || []) {
    (col.cards || []).forEach((id, i) => {
      if (!map.has(id)) map.set(id, { status: col.key, order: i });
    });
  }
  return map;
}

/** { status: [orderedCardIds] } derived from a config's columns. */
export function ordersFromConfig(raw) {
  const cfg = normalizeConfig(raw);
  const orders = {};
  for (const col of cfg?.kanban?.columns || []) orders[col.key] = [...(col.cards || [])];
  return orders;
}

/**
 * Compare a roadmap.json placement against the legacy placement (frontmatter
 * status + roadmap-index.md order). Returns sorted human-readable mismatch
 * strings; empty means the two agree. Order is only compared for the given
 * `orderStatuses` (the index-ordered columns) since other columns have no
 * meaningful legacy order.
 */
export function placementParity(newMap, legacyMap, orderStatuses = []) {
  const orderSet = new Set(orderStatuses);
  const diffs = [];
  const ids = new Set([...newMap.keys(), ...legacyMap.keys()]);
  for (const id of ids) {
    const n = newMap.get(id);
    const l = legacyMap.get(id);
    if (!n) {
      diffs.push(`${id}: ${l.status} in frontmatter but unplaced in roadmap.json`);
    } else if (!l) {
      diffs.push(`${id}: in roadmap.json (${n.status}) but not a current card`);
    } else if (n.status !== l.status) {
      diffs.push(`${id}: column ${l.status} (frontmatter) vs ${n.status} (roadmap.json)`);
    } else if (orderSet.has(n.status) && l.order != null && n.order !== l.order) {
      diffs.push(`${id}: ${n.status} order ${l.order} (index) vs ${n.order} (roadmap.json)`);
    }
  }
  return diffs.sort();
}

/**
 * Move a card into `statusKey` (creating the column if needed), removing it from
 * every other column. Appends unless a valid `index` is given. Returns a new config.
 */
export function setCardColumn(raw, cardId, statusKey, { index = null } = {}) {
  const cfg = normalizeConfig(raw) || emptyConfig();
  const columns = (cfg.kanban?.columns || []).map((c) => ({
    ...c,
    cards: (c.cards || []).filter((id) => id !== cardId),
  }));
  let col = columns.find((c) => c.key === statusKey);
  if (!col) {
    col = { key: statusKey, label: STATUS_LABELS[statusKey] || statusKey, cards: [] };
    columns.push(col);
  }
  if (index == null || index < 0 || index >= col.cards.length) col.cards.push(cardId);
  else col.cards.splice(index, 0, cardId);
  return { ...cfg, kanban: { ...cfg.kanban, columns } };
}

/**
 * Replace the ordered membership of the given columns. The caller supplies the
 * complete membership per column (Kando's UI derives it from full state, not the
 * filtered DOM), so replace is safe and correctly drops cards that moved away.
 * Columns not named are left untouched. Returns a new config.
 */
export function setColumnOrders(raw, sectionOrders) {
  const cfg = normalizeConfig(raw) || emptyConfig();
  const columns = (cfg.kanban?.columns || []).map((col) =>
    sectionOrders[col.key] ? { ...col, cards: [...sectionOrders[col.key]] } : col
  );
  for (const [key, ids] of Object.entries(sectionOrders)) {
    if (!columns.some((c) => c.key === key)) {
      columns.push({ key, label: STATUS_LABELS[key] || key, cards: [...ids] });
    }
  }
  return { ...cfg, kanban: { ...cfg.kanban, columns } };
}

/** Serialize a config for disk: 2-space JSON, one array item per line, trailing newline. */
export function serializeConfig(config) {
  return JSON.stringify(config, null, 2) + '\n';
}

/**
 * Resolve which config file a vault uses: roadmap.json wins, else an existing
 * kanban.json, else null (no config on disk yet).
 */
export async function resolveConfigFile(vaultDir) {
  const roadmapPath = path.join(vaultDir, ROADMAP_FILENAME);
  const legacyPath = path.join(vaultDir, LEGACY_FILENAME);
  if (await fileExists(roadmapPath)) return { path: roadmapPath, name: ROADMAP_FILENAME };
  if (await fileExists(legacyPath)) return { path: legacyPath, name: LEGACY_FILENAME };
  return null;
}

/** Load and parse a vault's config file. Returns { raw, file } or null. */
export async function loadRoadmapConfig(vaultDir) {
  const resolved = await resolveConfigFile(vaultDir);
  if (!resolved) return null;
  try {
    const content = await fs.readFile(resolved.path, 'utf-8');
    return { raw: JSON.parse(content), file: resolved.name, path: resolved.path };
  } catch {
    return null;
  }
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
