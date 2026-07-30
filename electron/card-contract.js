/**
 * Canonical Kando roadmap card contract — single source of truth for parsing,
 * validation, doctor reports, and agent-facing contract serialization.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  HORIZON_ORDER,
  ROADMAP_FILENAME,
  normalizeStatus,
} from './roadmap-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.resolve(__dirname, '../templates/cards');

export const TITLE_FIELD = 'plan_anchor';
export const REQUIRED_FIELDS = ['release'];

export const REJECTED_FIELDS = {
  kind: {
    didYouMean: 'Use initiative: true for initiatives and epic: true for epics — kind is not implemented.',
  },
  title: {
    didYouMean: `Use ${TITLE_FIELD} instead of title.`,
  },
};

export const MARKERS = {
  initiative: { field: 'initiative', value: true, description: 'initiative: true' },
  epic: { field: 'epic', value: true, description: 'epic: true' },
  slice: { field: null, value: null, description: '(no marker — slices are release-*.md without epic/initiative flags)' },
};

export const FILENAME_PATTERNS = {
  initiative: /^initiative-.+\.md$/,
  epic: /^release-epic-.+\.md$/,
  slice: /^release-(?!epic-).+\.md$/,
};

export const PARENT_LINKS = {
  epic: { field: 'initiative', pattern: /\[\[initiative-[^\]|]+\]\]/ },
  slice: { field: 'epic', pattern: /\[\[release-epic-[^\]|]+\]\]/ },
};

const CONVENTIONS_DRIFT_PATTERNS = [
  { pattern: /\bkind:\s*(initiative|epic|slice)\b/i, fix: 'Document initiative: true / epic: true instead of kind' },
  { pattern: /`kind`/i, fix: 'Remove kind from conventions — use initiative: true / epic: true' },
  { pattern: /\btitle:\s*/i, fix: `Document ${TITLE_FIELD} instead of title` },
  { pattern: /`title`/i, fix: `Document ${TITLE_FIELD} instead of title` },
];

const AGENT_STALE_MS = 48 * 60 * 60 * 1000;

/** Parent card id from epic: / initiative: wikilink frontmatter. */
export function extractParentId(data) {
  const wiki =
    typeof data.epic === 'string'
      ? data.epic
      : typeof data.initiative === 'string'
        ? data.initiative
        : null;
  if (!wiki) return null;
  const m = String(wiki).match(/\[\[([^\]|]+)/);
  return m ? m[1].trim() : null;
}

/** Infer card kind from markers and filename. */
export function inferCardKind(data, filename = '') {
  if (data?.initiative === true) return 'initiative';
  if (data?.epic === true) return 'epic';
  const base = path.basename(filename || '');
  if (FILENAME_PATTERNS.initiative.test(base)) return 'initiative';
  if (FILENAME_PATTERNS.epic.test(base)) return 'epic';
  return 'slice';
}

/** Contract warnings for a single card (rejected fields, marker/filename mismatch). */
export function getContractWarnings(data, cardId, filename = `${cardId}.md`) {
  const warnings = [];
  const kind = inferCardKind(data, filename);

  for (const [field, meta] of Object.entries(REJECTED_FIELDS)) {
    if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
      warnings.push({
        severity: 'error',
        field,
        message: `Rejected field "${field}" is present.`,
        fix: meta.didYouMean,
      });
    }
  }

  if (data.release !== true) {
    warnings.push({
      severity: 'error',
      field: 'release',
      message: 'Missing release: true — Kando will not load this file.',
      fix: 'Add release: true to frontmatter.',
    });
  }

  if (!data.plan_anchor) {
    warnings.push({
      severity: 'error',
      field: TITLE_FIELD,
      message: `Missing ${TITLE_FIELD}.`,
      fix: `Add ${TITLE_FIELD}: "<human title>" to frontmatter.`,
    });
  }

  if (data.initiative === true && data.epic === true) {
    warnings.push({
      severity: 'error',
      field: 'initiative',
      message: 'Card has both initiative: true and epic: true.',
      fix: 'Keep only one marker.',
    });
  }

  const base = path.basename(filename);
  if (kind === 'initiative' && !FILENAME_PATTERNS.initiative.test(base)) {
    warnings.push({
      severity: 'error',
      field: 'filename',
      message: 'Initiative cards must be named initiative-<slug>.md',
      fix: `Rename to initiative-${cardId.replace(/^initiative-/, '')}.md or fix markers.`,
    });
  }
  if (kind === 'epic' && !FILENAME_PATTERNS.epic.test(base)) {
    warnings.push({
      severity: 'error',
      field: 'filename',
      message: 'Epic cards must be named release-epic-<slug>.md',
      fix: 'Rename file or fix epic: true marker.',
    });
  }
  if (kind === 'slice' && !FILENAME_PATTERNS.slice.test(base)) {
    warnings.push({
      severity: 'error',
      field: 'filename',
      message: 'Slice cards must be named release-<slug>.md (not release-epic-).',
      fix: 'Rename file or fix markers.',
    });
  }

  if (kind === 'initiative' && data.initiative !== true) {
    warnings.push({
      severity: 'error',
      field: 'initiative',
      message: 'Filename suggests initiative but initiative: true is missing.',
      fix: 'Add initiative: true to frontmatter.',
    });
  }
  if (kind === 'epic' && data.epic !== true) {
    warnings.push({
      severity: 'error',
      field: 'epic',
      message: 'Filename suggests epic but epic: true is missing.',
      fix: 'Add epic: true to frontmatter.',
    });
  }

  if (kind === 'epic' && !extractParentId({ initiative: data.initiative })) {
    warnings.push({
      severity: 'error',
      field: 'initiative',
      message: 'Epic is missing initiative: wikilink parent.',
      fix: "Add initiative: '[[initiative-<slug>]]'",
    });
  }

  if (kind === 'slice' && !extractParentId({ epic: data.epic })) {
    warnings.push({
      severity: 'error',
      field: 'epic',
      message: 'Slice is missing epic: wikilink parent.',
      fix: "Add epic: '[[release-epic-<slug>]]'",
    });
  }

  return warnings;
}

/** Parsed identity fields for API responses. */
export function parseCardIdentity(data, cardId, filename = `${cardId}.md`) {
  const kind = inferCardKind(data, filename);
  const contract_warnings = getContractWarnings(data, cardId, filename);
  return {
    kind,
    is_initiative: kind === 'initiative',
    is_epic: kind === 'epic',
    title: data.plan_anchor || cardId,
    plan_anchor: data.plan_anchor || null,
    parent: extractParentId(data),
    contract_warnings,
  };
}

function hasSummary(content) {
  return /^## Summary\b/im.test(content || '');
}

function hasAcceptanceCriteria(content) {
  return /^## Acceptance criteria\b[\s\S]*?^- \[[ x]\]/im.test(content || '');
}

/**
 * Full validation — errors block writes; warnings are advisory.
 * @param {object} opts
 * @param {string} opts.cardId
 * @param {string} [opts.filename]
 * @param {object} opts.frontmatter
 * @param {string} [opts.content]
 * @param {object} opts.context — vaultDoctorContext shape
 */
export function validateCard({
  cardId,
  filename,
  frontmatter,
  content = '',
  context = {},
}) {
  const id = cardId || path.parse(filename || '').name;
  const file = filename || `${id}.md`;
  const data = frontmatter || {};
  const contractWarnings = getContractWarnings(data, id, file);
  const errors = contractWarnings.filter((w) => w.severity === 'error').map((w) => ({
    field: w.field,
    message: w.message,
    fix: w.fix,
  }));
  const warnings = [];

  const kind = inferCardKind(data, file);
  const parentId = extractParentId(data);
  if (parentId && context.cardIds && !context.cardIds.has(parentId)) {
    errors.push({
      field: kind === 'slice' ? 'epic' : 'initiative',
      message: `Parent card "${parentId}" has no file in this vault.`,
      fix: 'Create the parent card or fix the wikilink.',
    });
  }

  if (context.storage === 'frontmatter-index' && data.status) {
    const status = normalizeStatus(data.status);
    if (context.columnKeys?.length && !context.columnKeys.includes(status)) {
      errors.push({
        field: 'status',
        message: `Unknown status "${data.status}" for this vault.`,
        fix: `Use one of: ${context.columnKeys.join(', ')}`,
      });
    }
  }

  if (context.placedCardIds && !context.placedCardIds.has(id)) {
    warnings.push({
      field: 'placement',
      message: 'Card is not placed in any kanban column or index section.',
      fix:
        context.storage === 'roadmap-json'
          ? 'Add the card id to roadmap.json kanban.columns[].cards'
          : 'Add a wikilink under the right section in roadmap-index.md',
    });
  }

  if (kind === 'initiative' && context.strategyInitiativeIds && !context.strategyInitiativeIds.has(id)) {
    warnings.push({
      field: 'horizon',
      message: 'Initiative is not placed in any strategy horizon.',
      fix: 'Add to roadmap.json strategy.horizons or set horizon in frontmatter (legacy vaults).',
    });
  }

  if (!hasSummary(content)) {
    warnings.push({
      field: 'content',
      message: 'Missing ## Summary section.',
      fix: 'Add a ## Summary section with 1–3 plain-language sentences.',
    });
  }

  if (kind === 'slice' && !hasAcceptanceCriteria(content)) {
    warnings.push({
      field: 'content',
      message: 'Slice is missing ## Acceptance criteria with - [ ] checkboxes.',
      fix: 'Add ## Acceptance criteria with testable - [ ] items.',
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** Scan conventions.md for documented-but-unimplemented fields. */
export function scanConventionsDrift(conventionsText = '') {
  const issues = [];
  const lines = conventionsText.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (/do not|don't|never use|not read|rejected|do \*\*not\*\*/i.test(lower)) continue;
    for (const { pattern, fix } of CONVENTIONS_DRIFT_PATTERNS) {
      if (pattern.test(line)) {
        issues.push({
          severity: 'error',
          category: 'conventions_drift',
          message: `roadmap-conventions.md documents fields Kando does not read (${pattern}).`,
          fix,
        });
        break;
      }
    }
  }
  return issues;
}

/**
 * Vault-wide doctor report.
 * @param {object} opts
 */
export function vaultDoctor({
  vaultKey,
  vaultDir,
  cards = [],
  markdownFiles = [],
  conventionsText = '',
  storage = 'frontmatter-index',
  columnKeys = [],
  placementDiffs = [],
  strategyDiffs = [],
  placedCardIds = new Set(),
  strategyInitiativeIds = new Set(),
  roadmapJsonIds = new Set(),
}) {
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const cardIds = new Set(cards.map((c) => c.id));
  const errors = [];
  const warnings = [];

  for (const issue of scanConventionsDrift(conventionsText)) {
    errors.push({ ...issue, id: 'roadmap-conventions.md' });
  }

  for (const card of cards) {
    for (const w of card.contract_warnings || []) {
      const entry = {
        id: card.id,
        field: w.field,
        message: w.message,
        fix: w.fix,
        severity: w.severity,
        category: 'contract',
      };
      if (w.severity === 'error') errors.push(entry);
      else warnings.push(entry);
    }
  }

  for (const card of cards.filter((c) => c.unplaced)) {
    if (card.is_initiative && strategyInitiativeIds.has(card.id)) continue;
    warnings.push({
      id: card.id,
      category: 'unplaced',
      message: 'Card file exists but is not listed in roadmap.json.',
      fix: 'Add to kanban.columns[].cards in roadmap.json',
    });
  }

  for (const id of roadmapJsonIds) {
    if (!cardIds.has(id)) {
      errors.push({
        id,
        category: 'dangling',
        message: 'roadmap.json references a card id with no .md file.',
        fix: 'Remove from roadmap.json or create the card file.',
      });
    }
  }

  // roadmap.json vaults: frontmatter status/horizon is legacy — don't warn on parity drift.
  if (storage !== 'roadmap-json') {
    for (const diff of placementDiffs) {
      warnings.push({ category: 'placement_drift', message: diff });
    }
    for (const diff of strategyDiffs) {
      warnings.push({ category: 'strategy_drift', message: diff });
    }
  }

  const initiatives = cards.filter((c) => c.is_initiative);
  const epics = cards.filter((c) => c.is_epic);
  const slices = cards.filter((c) => !c.is_epic && !c.is_initiative);

  for (const epic of epics.filter((c) => !c.parent)) {
    warnings.push({
      id: epic.id,
      category: 'orphan_epic',
      message: 'Epic has no initiative parent.',
      fix: "Add initiative: '[[initiative-<slug>]]' and link from the initiative's ## Epics table.",
    });
  }

  for (const slice of slices.filter((c) => !c.parent)) {
    warnings.push({
      id: slice.id,
      category: 'orphan_slice',
      message: 'Slice has no epic parent.',
      fix: "Add epic: '[[release-epic-<slug>]]'",
    });
  }

  for (const init of initiatives) {
    const childEpics = epics.filter((e) => e.parent === init.id);
    if (childEpics.length === 0) {
      warnings.push({
        id: init.id,
        category: 'initiative_no_epics',
        message: 'Initiative has no linked epics yet.',
        fix: 'Create epics or link existing orphan epics from the initiative modal.',
      });
    }
  }

  const readableInitiatives = initiatives.filter(
    (c) => !(c.contract_warnings || []).some((w) => w.severity === 'error')
  );
  const unreadableInitiatives = initiatives.filter((c) =>
    (c.contract_warnings || []).some((w) => w.severity === 'error')
  );

  for (const card of cards) {
    if (card.agent_updated_at) {
      const then = new Date(card.agent_updated_at).getTime();
      if (!Number.isNaN(then) && Date.now() - then > AGENT_STALE_MS) {
        warnings.push({
          id: card.id,
          category: 'stale_agent',
          message: 'agent_updated_at is older than 48 hours.',
          fix: 'Update agent_status / agent_summary / agent_next or clear stale fields.',
        });
      }
    }
  }

  // Card-shaped .md files that aren't release cards
  for (const file of markdownFiles) {
    if (!/^(initiative-|release-).+\.md$/.test(file)) continue;
    if (cardIds.has(path.parse(file).name)) continue;
    errors.push({
      id: file,
      category: 'invisible_card',
      message: 'File matches card naming but is missing release: true (invisible to Kando).',
      fix: 'Add release: true to frontmatter.',
    });
  }

  const orphanEpics = epics.filter((c) => !c.parent).map((c) => ({
    id: c.id,
    title: c.title,
  }));

  return {
    vaultKey,
    vaultDir,
    storage,
    summary: {
      totalCards: cards.length,
      initiatives: initiatives.length,
      readableInitiatives: readableInitiatives.length,
      unreadableInitiatives: unreadableInitiatives.length,
      epics: epics.length,
      slices: slices.length,
      orphanEpics: orphanEpics.length,
      errorCount: errors.length,
      warningCount: warnings.length,
    },
    orphanEpics,
    unreadableInitiatives: unreadableInitiatives.map((c) => ({ id: c.id, title: c.title })),
    errors,
    warnings,
    ok: errors.length === 0,
  };
}

export async function loadCardTemplates() {
  const out = {};
  for (const kind of ['initiative', 'epic', 'slice']) {
    try {
      out[kind] = await fs.readFile(path.join(TEMPLATES_DIR, `${kind}.md`), 'utf-8');
    } catch {
      out[kind] = null;
    }
  }
  return out;
}

/**
 * Serialize the contract for agents.
 * @param {object} opts
 * @param {string} opts.vaultKey
 * @param {string} opts.storage — 'roadmap-json' | 'frontmatter-index'
 * @param {string[]} opts.columnKeys
 * @param {object} [opts.templates]
 */
export function cardContract({ vaultKey, storage, columnKeys, templates = {} }) {
  return {
    vaultKey,
    storage,
    markers: MARKERS,
    titleField: TITLE_FIELD,
    requiredFields: REQUIRED_FIELDS,
    parentLinks: {
      epic: "initiative: '[[initiative-<slug>]]'",
      slice: "epic: '[[release-epic-<slug>]]'",
    },
    filenames: {
      initiative: 'initiative-<slug>.md',
      epic: 'release-epic-<slug>.md',
      slice: 'release-<slug>.md',
    },
    rejectedFields: REJECTED_FIELDS,
    statuses: columnKeys,
    columnKeys,
    horizons: [...HORIZON_ORDER],
    placement:
      storage === 'roadmap-json'
        ? {
            kanban: 'roadmap.json → kanban.columns[].cards',
            strategy: 'roadmap.json → strategy.horizons[].initiatives',
          }
        : {
            kanban: 'roadmap-index.md wiki-link order under ## Active / Prioritized / Backlog',
            strategy: 'initiative frontmatter horizon + strategy-index.md (if present)',
          },
    templates,
    rules: [
      'Never invent frontmatter fields from design docs — only use fields named here.',
      'Fetch this contract before creating cards; validate before and after writing.',
      'Copy an existing card in the vault if Kando is not running.',
    ],
  };
}

export function detectStorageMode(roadmapCfg, placementSize = 0) {
  if (roadmapCfg?.file === ROADMAP_FILENAME && placementSize > 0) {
    return 'roadmap-json';
  }
  return 'frontmatter-index';
}

export function collectRoadmapJsonIds(raw) {
  const ids = new Set();
  for (const col of raw?.kanban?.columns || []) {
    for (const id of col.cards || []) ids.add(id);
  }
  for (const lane of raw?.strategy?.horizons || []) {
    for (const id of lane.initiatives || []) ids.add(id);
  }
  return ids;
}
