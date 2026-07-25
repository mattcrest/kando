import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { commitAll, getGitStatus, syncVault } from './git-vault.js';
import {
  getRoutingForVault,
  resolveVaultForWorkspace,
} from './vault-routing.js';
import {
  defaultIndexPath,
  INDEX_ORDERED_STATUSES,
  loadIndexOrders,
  ordersToPositionMaps,
  updateIndexSections,
} from './roadmap-index.js';
import {
  parseInitiativeEpics,
  replaceInitiativeEpics,
} from './initiative-epics.js';
import { loadAgentSuggestions } from './agent-suggestions.js';
import {
  loadRoadmapConfig,
  resolveConfigFile,
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
  ROADMAP_FILENAME,
  LEGACY_FILENAME,
} from './roadmap-config.js';

const app = express();
const PORT = 3001;

// Get __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Vaults configuration file
const VAULTS_CONFIG_FILE = './vaults.json';

// Default vaults: sibling checkout layout —
//   /dev/kando  →  /dev/venubase-roadmap  (canonical roadmap repo)
// Override with VENUBASE_ROADMAP_DIR (absolute path) for nonstandard layouts.
const DEFAULT_VENUBASE_ROADMAP = process.env.VENUBASE_ROADMAP_DIR
  ? path.resolve(process.env.VENUBASE_ROADMAP_DIR)
  : path.resolve(__dirname, '../../venubase-roadmap');

const DEFAULT_VAULTS = {
  venubase: DEFAULT_VENUBASE_ROADMAP,
};

let DEFAULT_VAULT = 'venubase';
let VAULTS = { ...DEFAULT_VAULTS };
let VAULT_COLORS = {
  venubase: '#0e7490',
  playerpath: '#0369a1',
};
let VAULT_GIT = {};
let VAULT_ROUTING = {};

// Load vaults from config file if it exists
async function loadVaultsConfig() {
  try {
    const data = await fs.readFile(VAULTS_CONFIG_FILE, 'utf-8');
    const config = JSON.parse(data);
    VAULTS = { ...DEFAULT_VAULTS, ...config.vaults };
    if (config.colors) {
      VAULT_COLORS = { ...VAULT_COLORS, ...config.colors };
    }
    if (config.default && VAULTS[config.default]) {
      DEFAULT_VAULT = config.default;
    }
    if (config.git) {
      VAULT_GIT = config.git;
    }
    if (config.routing && typeof config.routing === 'object') {
      VAULT_ROUTING = config.routing;
    }
    console.log('Loaded vaults from config:', Object.keys(VAULTS));
    console.log('Default vault:', DEFAULT_VAULT);
    if (Object.keys(VAULT_ROUTING).length > 0) {
      console.log('Routing configured for:', Object.keys(VAULT_ROUTING).join(', '));
    }
  } catch {
    // Config file doesn't exist yet, use defaults
    console.log('Using default vaults configuration');
  }
}

// Save vaults to config file
async function saveVaultsConfig() {
  try {
    const customVaults = {};
    const customColors = {};
    for (const [key, val] of Object.entries(VAULTS)) {
      if (!(key in DEFAULT_VAULTS)) {
        customVaults[key] = val;
      } else {
        // Save default vault's path if it changed
        if (val !== DEFAULT_VAULTS[key]) {
          customVaults[key] = val;
        }
      }
    }
    // Save custom colors
    for (const [key, color] of Object.entries(VAULT_COLORS)) {
      const defaultColor = key === 'venubase' ? '#5b5bd6' : key === 'playerpath' ? '#8b5cf6' : null;
      if (color !== defaultColor) {
        customColors[key] = color;
      }
    }
    const config = {
      vaults: customVaults,
      colors: Object.keys(customColors).length > 0 ? customColors : undefined,
      default: DEFAULT_VAULT,
      git: Object.keys(VAULT_GIT).length > 0 ? VAULT_GIT : undefined,
      routing:
        Object.keys(VAULT_ROUTING).length > 0 ? VAULT_ROUTING : undefined,
    };
    await fs.writeFile(VAULTS_CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Failed to save vaults config:', err.message);
  }
}

app.use(cors());
app.use(express.json());

// Helper to resolve vault key from request
function getVaultKey(req) {
  const vault = req.query.vault || req.params?.name || DEFAULT_VAULT;
  if (VAULTS[vault]) return vault;
  const lowerVault = vault.toLowerCase();
  return Object.keys(VAULTS).find(k => k.toLowerCase() === lowerVault) || DEFAULT_VAULT;
}

// Helper to get vault directory from request
function getVaultDir(req) {
  const key = getVaultKey(req);
  return VAULTS[key];
}

function getVaultGitOptions(vaultKey) {
  const vaultGit = VAULT_GIT[vaultKey] || {};
  const envAuto = process.env.KANDO_AUTO_GIT_COMMIT === '1';
  return {
    autoCommit: vaultGit.autoCommit ?? envAuto,
    autoPush: vaultGit.autoPush ?? false,
    remote: vaultGit.remote || 'origin',
    branch: vaultGit.branch || null,
  };
}

async function maybeAutoCommitVault(vaultKey, vaultDir, message) {
  const opts = getVaultGitOptions(vaultKey);
  if (!opts.autoCommit) return null;
  try {
    const result = await commitAll(vaultDir, message);
    if (opts.autoPush) {
      const status = await getGitStatus(vaultDir);
      if (result.committed || status.ahead > 0) {
        await push(vaultDir, opts.remote, opts.branch);
      }
    }
    return result;
  } catch (err) {
    console.warn(`Auto git commit failed (${vaultKey}):`, err.message);
    return null;
  }
}

// Helper to extract card ID from filename
function getCardId(filename) {
  return path.parse(filename).name;
}

// Helper to get full path for a card
function getCardPath(cardId, vaultDir) {
  return path.join(vaultDir, `${cardId}.md`);
}

// Helper to check if a file is a release card
async function isReleaseCard(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { data } = matter(content);
    return data.release === true;
  } catch {
    return false;
  }
}

// Load a vault's board config (roadmap.json, falling back to legacy kanban.json)
// and flatten to the shape the current UI/server consumers expect.
async function loadKanbanConfig(vaultDir) {
  const loaded = await loadRoadmapConfig(vaultDir);
  if (!loaded) return null;
  return toLegacyConfig(normalizeConfig(loaded.raw));
}

// Persist column-definition / settings edits to whichever config file the vault
// uses. roadmap.json is written in the new shape (preserving card membership);
// an existing kanban.json keeps its legacy shape until the migration completes.
async function saveKanbanConfig(vaultDir, edits) {
  try {
    const resolved = await resolveConfigFile(vaultDir);
    const targetName = resolved?.name || ROADMAP_FILENAME;
    const targetPath = resolved?.path || path.join(vaultDir, ROADMAP_FILENAME);

    if (targetName === LEGACY_FILENAME) {
      const raw = JSON.parse(await fs.readFile(targetPath, 'utf-8'));
      if (edits.columns) raw.columns = edits.columns;
      if (edits.settings) raw.settings = { ...raw.settings, ...edits.settings };
      await fs.writeFile(targetPath, JSON.stringify(raw, null, 2));
      return true;
    }

    const existingRaw = resolved ? JSON.parse(await fs.readFile(targetPath, 'utf-8')) : null;
    const next = applyConfigEdits(existingRaw, edits);
    await fs.writeFile(targetPath, serializeConfig(next));
    return true;
  } catch (err) {
    console.error('Failed to save roadmap config:', err);
    return false;
  }
}

function getIndexPath(vaultKey, vaultDir) {
  const routing = getRoutingForVault(vaultKey, VAULT_ROUTING);
  const indexFile = routing?.indexFile || 'roadmap-index.md';
  return defaultIndexPath(vaultDir, indexFile);
}

// Apply a mutation to a vault's roadmap.json, if it is a migrated vault (has a
// real roadmap.json, not just a legacy kanban.json). Returns true if written.
async function updateRoadmapConfigFile(vaultDir, mutate) {
  const loaded = await loadRoadmapConfig(vaultDir);
  if (!loaded || loaded.file !== ROADMAP_FILENAME) return false;
  const next = mutate(loaded.raw);
  await fs.writeFile(loaded.path, serializeConfig(next), 'utf-8');
  return true;
}

function compareCardsByIndex(a, b) {
  const ao = a.index_order ?? a.roadmap_order ?? Infinity;
  const bo = b.index_order ?? b.roadmap_order ?? Infinity;
  if (ao !== bo) return ao - bo;
  return a.id.localeCompare(b.id);
}

function attachIndexOrder(cards, positionMaps) {
  if (!positionMaps) return cards;
  for (const card of cards) {
    const pos = positionMaps[card.status]?.[card.id];
    card.index_order = pos !== undefined ? pos : null;
  }
  return cards;
}

async function patchCardFrontmatter(vaultDir, cardId, patch) {
  const cardPath = getCardPath(cardId, vaultDir);
  const content = await fs.readFile(cardPath, 'utf-8');
  const { data, content: markdownContent } = matter(content);
  const newData = { ...data, ...patch };
  const orderedData = {
    type: newData.type,
    release: newData.release,
    status: newData.status,
    roadmap_order: newData.roadmap_order,
    related_to: newData.related_to,
    plan_anchor: newData.plan_anchor,
    ...Object.fromEntries(
      Object.entries(newData).filter(
        ([k]) => !['type', 'release', 'status', 'roadmap_order', 'related_to', 'plan_anchor'].includes(k)
      )
    ),
  };
  await fs.writeFile(cardPath, matter.stringify(markdownContent, orderedData), 'utf-8');
}

/** Keep Tolaria Active view in sync — derived from index position. */
async function syncActiveRoadmapOrder(vaultDir, activeCardIds) {
  for (let i = 0; i < activeCardIds.length; i++) {
    await patchCardFrontmatter(vaultDir, activeCardIds[i], {
      roadmap_order: (i + 1) * 10,
    });
  }
}

async function readCard(vaultDir, cardId) {
  const cardPath = getCardPath(cardId, vaultDir);
  const content = await fs.readFile(cardPath, 'utf-8');
  const { data, content: markdownContent } = matter(content);
  return { cardPath, data, markdownContent };
}

async function clearEpicInitiativeLink(vaultDir, epicId, initiativeId) {
  const { data, markdownContent } = await readCard(vaultDir, epicId);
  const expected = `[[${initiativeId}]]`;
  const current = String(data.initiative || '').replace(/^'|'$/g, '');
  if (current !== expected && current !== initiativeId) return;
  const cardPath = getCardPath(epicId, vaultDir);
  const nextData = { ...data };
  delete nextData.initiative;
  const orderedData = {
    type: nextData.type,
    release: nextData.release,
    status: nextData.status,
    roadmap_order: nextData.roadmap_order,
    related_to: nextData.related_to,
    plan_anchor: nextData.plan_anchor,
    ...Object.fromEntries(
      Object.entries(nextData).filter(
        ([k]) => !['type', 'release', 'status', 'roadmap_order', 'related_to', 'plan_anchor'].includes(k)
      )
    ),
  };
  await fs.writeFile(cardPath, matter.stringify(markdownContent, orderedData), 'utf-8');
}

async function setEpicInitiativeLink(vaultDir, epicId, initiativeId) {
  await patchCardFrontmatter(vaultDir, epicId, {
    initiative: `[[${initiativeId}]]`,
  });
}

/** Parent card id: slices link up via `epic:` wikilink, epics via `initiative:` wikilink. */
function extractParentId(data) {
  const wiki = typeof data.epic === 'string' ? data.epic
    : typeof data.initiative === 'string' ? data.initiative
    : null;
  if (!wiki) return null;
  const m = String(wiki).match(/\[\[([^\]|]+)/);
  return m ? m[1].trim() : null;
}

// GET /api/cards - List all release cards with metadata
app.get('/api/cards', async (req, res) => {
  try {
    const vaultDir = getVaultDir(req);
    const files = await fs.readdir(vaultDir);
    const markdownFiles = files.filter(f => f.endsWith('.md'));

    const cards = [];
    for (const file of markdownFiles) {
      const filePath = path.join(vaultDir, file);
      try {
        if (await isReleaseCard(filePath)) {
          const content = await fs.readFile(filePath, 'utf-8');
          const { data } = matter(content);
          const cardId = getCardId(file);

          cards.push({
            id: cardId,
            title: data.plan_anchor || cardId,
            status: normalizeStatus(data.status),
            roadmap_order: data.roadmap_order || null,
            category: data.category || null,
            plan_anchor: data.plan_anchor || null,
            path: file,
            shipped_at: data.shipped_at || null,
            is_epic: data.epic === true,
            is_initiative: data.initiative === true,
            horizon: data.horizon || null,
            milestone: data.milestone || null,
            parent: extractParentId(data),
            agent_status: data.agent_status || null,
            agent_provider: data.agent_provider || null,
            agent_summary: data.agent_summary || null,
            agent_next: data.agent_next || null,
            agent_updated_at: data.agent_updated_at || null,
          });
        }
      } catch (err) {
        console.error(`Error reading ${file}:`, err.message);
      }
    }

    const vaultKey = getVaultKey(req);
    const indexPath = getIndexPath(vaultKey, vaultDir);
    const indexOrders = await loadIndexOrders(indexPath);
    const positionMaps = ordersToPositionMaps(indexOrders);

    // Legacy placement (frontmatter status + roadmap-index.md order) is always
    // computed: it's the derivation for un-migrated vaults and the parity
    // baseline for migrated ones.
    const legacyMap = new Map(
      cards.map((c) => [c.id, { status: c.status, order: positionMaps[c.status]?.[c.id] ?? null }])
    );

    const roadmapCfg = await loadRoadmapConfig(vaultDir);
    const placement = roadmapCfg ? placementFromConfig(roadmapCfg.raw) : null;
    // Flip only for a real roadmap.json with actual membership — a legacy
    // kanban.json (column labels, no `cards`) must stay on the legacy path.
    const useRoadmapJson = roadmapCfg?.file === ROADMAP_FILENAME && placement.size > 0;

    if (useRoadmapJson) {
      const diffs = placementParity(placement, legacyMap, INDEX_ORDERED_STATUSES);
      if (diffs.length) {
        console.warn(
          `[roadmap.json] placement drift in vault '${vaultKey}' (${diffs.length}):\n  ` +
            diffs.slice(0, 10).join('\n  ') +
            (diffs.length > 10 ? `\n  …and ${diffs.length - 10} more` : '')
        );
      }
      for (const card of cards) {
        const p = placement.get(card.id);
        if (p) {
          card.status = p.status;
          card.index_order = p.order;
          card.unplaced = false;
        } else {
          // On disk but not in roadmap.json: keep its frontmatter status so it
          // still renders, and flag it (guardrail 6 — surface, don't lose).
          card.index_order = null;
          card.unplaced = true;
        }
      }
    } else {
      attachIndexOrder(cards, positionMaps);
    }

    // Strategy placement: when roadmap.json has strategy membership, apply
    // horizon from it for initiatives and flag Past/Future as archived.
    if (roadmapCfg?.file === ROADMAP_FILENAME) {
      const strategyPlacement = strategyPlacementFromConfig(roadmapCfg.raw);
      if (strategyPlacement.size > 0) {
        const legacyStrategy = new Map(
          cards
            .filter((c) => c.is_initiative)
            .map((c) => [c.id, { horizon: normalizeHorizon(c.horizon), order: null }])
        );
        const strategyDiffs = strategyParity(strategyPlacement, legacyStrategy);
        // Only warn on horizon mismatches (ignore order — legacy has no stable order).
        const horizonDiffs = strategyDiffs.filter((d) => d.includes('horizon') || d.includes('unplaced'));
        if (horizonDiffs.length) {
          console.warn(
            `[roadmap.json] strategy drift in vault '${vaultKey}' (${horizonDiffs.length}):\n  ` +
              horizonDiffs.slice(0, 10).join('\n  ') +
              (horizonDiffs.length > 10 ? `\n  …and ${horizonDiffs.length - 10} more` : '')
          );
        }
        for (const card of cards) {
          if (!card.is_initiative) continue;
          const sp = strategyPlacement.get(card.id);
          if (sp) {
            card.horizon = sp.horizon;
            card.strategy_order = sp.order;
          }
        }
      }
    }
    for (const card of cards) {
      if (card.is_initiative) {
        card.horizon = normalizeHorizon(card.horizon);
        card.archived = isArchivedHorizon(card.horizon);
      }
    }

    cards.sort(compareCardsByIndex);

    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cards/:cardId - Get card with full content
app.get('/api/cards/:cardId', async (req, res) => {
  try {
    const { cardId } = req.params;
    const vaultDir = getVaultDir(req);
    const cardPath = getCardPath(cardId, vaultDir);

    const content = await fs.readFile(cardPath, 'utf-8');
    const { data, content: markdownContent } = matter(content);
    const isInitiative = data.initiative === true;
    let horizon = data.horizon ? normalizeHorizon(data.horizon) : null;
    if (isInitiative) {
      const roadmapCfg = await loadRoadmapConfig(vaultDir);
      if (roadmapCfg?.file === ROADMAP_FILENAME) {
        const sp = strategyPlacementFromConfig(roadmapCfg.raw).get(cardId);
        if (sp) horizon = sp.horizon;
      }
      if (!horizon) horizon = 'Later';
    }

    res.json({
      id: cardId,
      title: data.plan_anchor || cardId,
      status: normalizeStatus(data.status),
      roadmap_order: data.roadmap_order || null,
      category: data.category || null,
      plan_anchor: data.plan_anchor || null,
      path: `${cardId}.md`,
      shipped_at: data.shipped_at || null,
      is_epic: data.epic === true,
      is_initiative: isInitiative,
      horizon,
      milestone: data.milestone || null,
      parent: extractParentId(data),
      archived: isInitiative && isArchivedHorizon(horizon),
      agent_status: data.agent_status || null,
      agent_provider: data.agent_provider || null,
      agent_summary: data.agent_summary || null,
      agent_next: data.agent_next || null,
      agent_updated_at: data.agent_updated_at || null,
      frontmatter: data,
      content: markdownContent,
    });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// PUT /api/cards/:cardId - Update card metadata (frontmatter)
app.put('/api/cards/:cardId', async (req, res) => {
  try {
    const { cardId } = req.params;
    const vaultDir = getVaultDir(req);
    const cardPath = getCardPath(cardId, vaultDir);
    const updates = req.body;

    const content = await fs.readFile(cardPath, 'utf-8');
    const { data, content: markdownContent } = matter(content);

    // Merge updates with existing frontmatter
    const newData = { ...data, ...updates };
    if (Object.prototype.hasOwnProperty.call(updates, 'horizon')) {
      newData.horizon = normalizeHorizon(newData.horizon);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
      newData.status = normalizeStatus(newData.status);
    }

    // Preserve field order for consistency
    const orderedData = {
      type: newData.type,
      release: newData.release,
      status: newData.status,
      roadmap_order: newData.roadmap_order,
      related_to: newData.related_to,
      plan_anchor: newData.plan_anchor,
      ...Object.fromEntries(
        Object.entries(newData).filter(
          ([k]) => !['type', 'release', 'status', 'roadmap_order', 'related_to', 'plan_anchor'].includes(k)
        )
      ),
    };

    // Reconstruct markdown with updated frontmatter. Drop undefined values —
    // minimal cards omit type/roadmap_order/related_to, and js-yaml refuses to
    // dump `undefined`.
    const cleanedData = Object.fromEntries(
      Object.entries(orderedData).filter(([, v]) => v !== undefined)
    );
    const updatedContent = matter.stringify(markdownContent, cleanedData);
    await fs.writeFile(cardPath, updatedContent, 'utf-8');

    // Mirror a column move into roadmap.json for migrated vaults. Order within
    // an index-ordered column is finalised by the follow-up reorder request.
    if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
      await updateRoadmapConfigFile(vaultDir, (raw) => setCardColumn(raw, cardId, newData.status));
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'horizon')) {
      await updateRoadmapConfigFile(vaultDir, (raw) =>
        setInitiativeHorizon(raw, cardId, newData.horizon)
      );
    }

    const vaultKey = getVaultKey(req);
    await maybeAutoCommitVault(vaultKey, vaultDir, `roadmap: update ${cardId} metadata`);

    res.json({ id: cardId, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/strategy - Strategy horizon membership from roadmap.json (or empty)
app.get('/api/strategy', async (req, res) => {
  try {
    const vaultDir = getVaultDir(req);
    const loaded = await loadRoadmapConfig(vaultDir);
    const placement = loaded ? strategyPlacementFromConfig(loaded.raw) : new Map();
    const horizons = {};
    for (const key of HORIZON_ORDER) horizons[key] = [];
    if (loaded?.raw?.strategy?.horizons) {
      for (const lane of loaded.raw.strategy.horizons) {
        const key = normalizeHorizon(lane.key);
        horizons[key] = [...(lane.initiatives || [])];
      }
    }
    res.json({
      horizons,
      orderedHorizons: HORIZON_ORDER,
      placementSize: placement.size,
      file: loaded?.file || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/strategy - Replace strategy horizon membership + sync frontmatter horizons
app.put('/api/strategy', async (req, res) => {
  try {
    const vaultKey = getVaultKey(req);
    const vaultDir = getVaultDir(req);
    const { horizons } = req.body || {};
    if (!horizons || typeof horizons !== 'object') {
      return res.status(400).json({ error: 'horizons object is required' });
    }

    const filtered = {};
    for (const key of HORIZON_ORDER) {
      if (Array.isArray(horizons[key])) filtered[key] = horizons[key];
    }
    if (Object.keys(filtered).length === 0) {
      return res.status(400).json({ error: 'horizons must include at least one named lane' });
    }

    const roadmapUpdated = await updateRoadmapConfigFile(vaultDir, (raw) =>
      setStrategyOrders(raw, filtered)
    );
    if (!roadmapUpdated) {
      return res.status(404).json({ error: 'roadmap.json not found — migrate vault first' });
    }

    // Dual-write frontmatter horizon for each initiative listed.
    for (const [horizon, ids] of Object.entries(filtered)) {
      for (const id of ids) {
        try {
          await patchCardFrontmatter(vaultDir, id, { horizon });
        } catch (err) {
          console.warn(`strategy: could not update frontmatter for ${id}: ${err.message}`);
        }
      }
    }

    await maybeAutoCommitVault(vaultKey, vaultDir, 'roadmap: update strategy horizons');

    const loaded = await loadRoadmapConfig(vaultDir);
    const out = {};
    for (const key of HORIZON_ORDER) out[key] = [];
    for (const lane of loaded.raw.strategy?.horizons || []) {
      out[normalizeHorizon(lane.key)] = [...(lane.initiatives || [])];
    }
    res.json({ success: true, horizons: out });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/roadmap-index - Parsed section order from roadmap-index.md
app.get('/api/roadmap-index', async (req, res) => {
  try {
    const vaultKey = getVaultKey(req);
    const vaultDir = getVaultDir(req);
    const indexPath = getIndexPath(vaultKey, vaultDir);
    const orders = await loadIndexOrders(indexPath);
    if (!orders) {
      return res.status(404).json({ error: 'roadmap index not found', indexPath });
    }
    res.json({ indexPath, orders, orderedStatuses: INDEX_ORDERED_STATUSES });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agent-suggestions - Parsed agent-suggestions.md, resolved against cards
app.get('/api/agent-suggestions', async (req, res) => {
  try {
    const vaultKey = getVaultKey(req);
    const vaultDir = getVaultDir(req);
    const parsed = await loadAgentSuggestions(vaultDir);
    if (!parsed) {
      return res.json({ generated_at: null, generated_by: null, context: null, items: [] });
    }

    const items = [];
    for (const item of parsed.items) {
      const cardPath = getCardPath(item.cardId, vaultDir);
      try {
        const content = await fs.readFile(cardPath, 'utf-8');
        const { data } = matter(content);
        if (data.epic === true || data.initiative === true) {
          // "Up next" is a slices-only surface, same contract as the
          // Workbench bench — silently including an epic/initiative here
          // would suggest work that isn't a single agent-sized PR.
          console.warn(
            `[agent-suggestions] skipping non-slice card '${item.cardId}' (epic/initiative) in vault '${vaultKey}'`
          );
          continue;
        }
        items.push({
          cardId: item.cardId,
          rationale: item.rationale,
          title: data.plan_anchor || item.cardId,
          status: normalizeStatus(data.status),
          parent: extractParentId(data),
          missing: false,
        });
      } catch {
        items.push({
          cardId: item.cardId,
          rationale: item.rationale,
          title: item.cardId,
          status: null,
          parent: null,
          missing: true,
        });
      }
    }

    res.json({ ...parsed.frontmatter, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/roadmap-index - Update section order in roadmap-index.md
app.put('/api/roadmap-index', async (req, res) => {
  try {
    const vaultKey = getVaultKey(req);
    const vaultDir = getVaultDir(req);
    const indexPath = getIndexPath(vaultKey, vaultDir);
    const { sections } = req.body;

    if (!sections || typeof sections !== 'object') {
      return res.status(400).json({ error: 'sections object is required' });
    }

    const filtered = {};
    for (const status of INDEX_ORDERED_STATUSES) {
      if (Array.isArray(sections[status])) {
        filtered[status] = sections[status];
      }
    }

    if (Object.keys(filtered).length === 0) {
      return res.status(400).json({ error: 'sections must include at least one ordered status' });
    }

    // Update roadmap.json first when it's authoritative (migrated vault).
    const roadmapUpdated = await updateRoadmapConfigFile(vaultDir, (raw) =>
      setColumnOrders(raw, filtered)
    );

    // Keep the legacy index in sync when it exists. For a migrated vault the
    // index file is optional, so a missing one is not an error.
    try {
      await updateIndexSections(indexPath, filtered);
      if (filtered.Active) await syncActiveRoadmapOrder(vaultDir, filtered.Active);
    } catch (err) {
      if (!roadmapUpdated) throw err;
    }

    await maybeAutoCommitVault(vaultKey, vaultDir, 'roadmap: update index order');

    const orders = roadmapUpdated
      ? ordersFromConfig((await loadRoadmapConfig(vaultDir)).raw)
      : await loadIndexOrders(indexPath);
    res.json({ success: true, indexPath, orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/cards/:cardId/content - Update card markdown content
app.put('/api/cards/:cardId/content', async (req, res) => {
  try {
    const { cardId } = req.params;
    const { content: newContent } = req.body;
    const vaultDir = getVaultDir(req);
    const cardPath = getCardPath(cardId, vaultDir);

    const existingContent = await fs.readFile(cardPath, 'utf-8');
    const { data } = matter(existingContent);

    // Reconstruct markdown with preserved frontmatter and new content
    const updatedContent = matter.stringify(newContent, data);
    await fs.writeFile(cardPath, updatedContent, 'utf-8');

    const vaultKey = getVaultKey(req);
    await maybeAutoCommitVault(vaultKey, vaultDir, `roadmap: update ${cardId} content`);

    res.json({ id: cardId, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/initiatives/:initiativeId/epics — parsed epic rows for an initiative card
app.get('/api/initiatives/:initiativeId/epics', async (req, res) => {
  try {
    const { initiativeId } = req.params;
    const vaultDir = getVaultDir(req);
    const { data, markdownContent } = await readCard(vaultDir, initiativeId);
    if (data.initiative !== true) {
      return res.status(400).json({ error: 'Not an initiative card' });
    }
    const rows = parseInitiativeEpics(markdownContent);
    res.json({ initiativeId, rows });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// PUT /api/initiatives/:initiativeId/epics — reorder / add / remove linked epics
app.put('/api/initiatives/:initiativeId/epics', async (req, res) => {
  try {
    const { initiativeId } = req.params;
    const { rows } = req.body;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: 'rows array is required' });
    }

    const vaultDir = getVaultDir(req);
    const vaultKey = getVaultKey(req);
    const { data, markdownContent } = await readCard(vaultDir, initiativeId);
    if (data.initiative !== true) {
      return res.status(400).json({ error: 'Not an initiative card' });
    }

    const previous = parseInitiativeEpics(markdownContent);
    const previousIds = new Set(previous.map((r) => r.id));
    const nextIds = new Set(rows.map((r) => r.id));

    const normalized = rows.map((row) => {
      const epicMeta = previous.find((p) => p.id === row.id);
      return {
        id: row.id,
        status: row.status || epicMeta?.status || 'Backlog',
        notes: row.notes ?? epicMeta?.notes ?? '',
      };
    });

    const newBody = replaceInitiativeEpics(markdownContent, normalized);
    const cardPath = getCardPath(initiativeId, vaultDir);
    await fs.writeFile(cardPath, matter.stringify(newBody, data), 'utf-8');

    for (const row of normalized) {
      await setEpicInitiativeLink(vaultDir, row.id, initiativeId);
    }
    for (const id of previousIds) {
      if (!nextIds.has(id)) {
        await clearEpicInitiativeLink(vaultDir, id, initiativeId);
      }
    }

    await maybeAutoCommitVault(vaultKey, vaultDir, `roadmap: update ${initiativeId} epics`);

    res.json({ initiativeId, rows: normalized, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check & vault info
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', vaults: Object.keys(VAULTS) });
});

app.get('/api/vaults', async (req, res) => {
  try {
    const vaultList = [];
    for (const [vaultKey, dir] of Object.entries(VAULTS)) {
      const kanbanConfig = await loadKanbanConfig(dir);
      const vaultName = kanbanConfig?.name || vaultKey;
      const color = kanbanConfig?.color || VAULT_COLORS[vaultKey] || '#5b5bd6';
      vaultList.push({
        name: vaultName,
        key: vaultKey,
        path: dir,
        color,
        isDefault: vaultKey === DEFAULT_VAULT,
        kanban: kanbanConfig,
        routing: getRoutingForVault(vaultKey, VAULT_ROUTING),
      });
    }
    res.json({
      vaults: vaultList,
      default: DEFAULT_VAULT,
      routing: VAULT_ROUTING,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/routing/resolve - Map a workspace root to a vault + conventions paths
app.get('/api/routing/resolve', (req, res) => {
  try {
    const workspaceRoot = req.query.workspaceRoot || req.query.cwd;
    if (!workspaceRoot) {
      return res.status(400).json({
        error: 'workspaceRoot or cwd query parameter is required',
      });
    }

    const resolved = resolveVaultForWorkspace(
      workspaceRoot,
      VAULT_ROUTING,
      VAULTS
    );

    if (!resolved) {
      return res.json({
        matched: false,
        workspaceRoot: path.resolve(workspaceRoot),
        vaults: Object.keys(VAULTS),
        hint: 'Add routing.<vaultKey>.workspaceRoots in vaults.json',
      });
    }

    const { conventionsFile, indexFile, canonicalRepo } = resolved.routing;
    res.json({
      matched: true,
      workspaceRoot: path.resolve(workspaceRoot),
      vaultKey: resolved.vaultKey,
      vaultPath: resolved.vaultPath,
      conventionsPath: path.join(resolved.vaultPath, conventionsFile),
      indexPath: path.join(resolved.vaultPath, indexFile),
      routing: resolved.routing,
      canonicalRepo,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vaults/add - Add a new vault
app.post('/api/vaults/add', async (req, res) => {
  try {
    const { name, path: vaultPath } = req.body;

    if (!name || !vaultPath) {
      return res.status(400).json({ error: 'Name and path are required' });
    }

    if (VAULTS[name]) {
      return res.status(400).json({ error: `Vault '${name}' already exists` });
    }

    // Validate that the path exists and contains markdown files
    try {
      const files = await fs.readdir(vaultPath);
      const hasMarkdown = files.some(f => f.endsWith('.md'));
      if (!hasMarkdown) {
        return res.status(400).json({ error: 'No markdown files found in directory' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid path or directory not accessible' });
    }

    VAULTS[name] = vaultPath;
    await saveVaultsConfig();
    res.json({ success: true, vault: { name, path: vaultPath } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/vaults/:name - Update a vault
app.put('/api/vaults/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const { name: newName, path: newPath } = req.body;

    if (!newName || !newPath) {
      return res.status(400).json({ error: 'Name and path are required' });
    }

    if (!VAULTS[name]) {
      return res.status(404).json({ error: `Vault '${name}' not found` });
    }

    // Check if new name already exists (only if renaming)
    if (newName !== name && VAULTS[newName]) {
      return res.status(400).json({ error: `Vault '${newName}' already exists` });
    }

    // Validate that the path exists and contains markdown files
    try {
      const files = await fs.readdir(newPath);
      const hasMarkdown = files.some(f => f.endsWith('.md'));
      if (!hasMarkdown) {
        return res.status(400).json({ error: 'No markdown files found in directory' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid path or directory not accessible' });
    }

    // If name is changing, delete old key and create new one
    if (newName !== name) {
      delete VAULTS[name];
    }

    VAULTS[newName] = newPath;
    await saveVaultsConfig();
    res.json({ success: true, vault: { name: newName, path: newPath } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vaults/:name/set-default - Set a vault as default
app.post('/api/vaults/:name/set-default', async (req, res) => {
  try {
    const { name } = req.params;

    if (!VAULTS[name]) {
      return res.status(404).json({ error: `Vault '${name}' not found` });
    }

    DEFAULT_VAULT = name;
    await saveVaultsConfig();
    res.json({ success: true, default: DEFAULT_VAULT });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vaults/:name/color - Update a vault's color
app.post('/api/vaults/:name/color', async (req, res) => {
  try {
    const { name } = req.params;
    const { color } = req.body;

    if (!color || !/^#[0-9A-F]{6}$/i.test(color)) {
      return res.status(400).json({ error: 'Invalid color format (must be #RRGGBB)' });
    }

    if (!VAULTS[name]) {
      return res.status(404).json({ error: `Vault '${name}' not found` });
    }

    VAULT_COLORS[name] = color;
    await saveVaultsConfig();
    res.json({ success: true, color });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/vaults/:name - Remove a vault
app.delete('/api/vaults/:name', async (req, res) => {
  try {
    const { name } = req.params;

    if (name === DEFAULT_VAULT) {
      return res.status(400).json({ error: 'Cannot delete the default vault' });
    }

    if (!VAULTS[name]) {
      return res.status(404).json({ error: `Vault '${name}' not found` });
    }

    delete VAULTS[name];
    await saveVaultsConfig();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/vaults/:name/kanban - Update vault kanban config
app.put('/api/vaults/:name/kanban', async (req, res) => {
  try {
    const { name } = req.params;
    const { columns, settings } = req.body;

    if (!VAULTS[name]) {
      return res.status(404).json({ error: `Vault '${name}' not found` });
    }

    const vaultDir = VAULTS[name];
    const existing = await loadKanbanConfig(vaultDir);
    if (!existing) {
      return res.status(404).json({ error: 'Roadmap config not found' });
    }

    const saved = await saveKanbanConfig(vaultDir, { columns, settings });
    if (!saved) {
      return res.status(500).json({ error: 'Failed to save roadmap config' });
    }

    await maybeAutoCommitVault(name, vaultDir, `roadmap: update ${name} kanban columns`);

    const config = await loadKanbanConfig(vaultDir);
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vaults/:name/git/status - Git status for vault directory
app.get('/api/vaults/:name/git/status', async (req, res) => {
  try {
    const name = req.params.name;
    if (!VAULTS[name]) {
      return res.status(404).json({ error: `Vault '${name}' not found` });
    }
    const status = await getGitStatus(VAULTS[name]);
    const gitOptions = getVaultGitOptions(name);
    const routing = getRoutingForVault(name, VAULT_ROUTING);
    const canonicalRepo = routing?.canonicalRepo || null;
    let repoName = status.repoName;
    let repoWebUrl = status.repoWebUrl;
    if (canonicalRepo) {
      const short = canonicalRepo.split('/').pop();
      if (short) repoName = short;
      if (!repoWebUrl) repoWebUrl = `https://github.com/${canonicalRepo}`;
    }
    res.json({
      ...status,
      canonicalRepo,
      repoName,
      repoWebUrl,
      autoCommit: gitOptions.autoCommit,
      autoPush: gitOptions.autoPush,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vaults/:name/conventions - Raw text of the vault's roadmap-conventions.md
app.get('/api/vaults/:name/conventions', async (req, res) => {
  try {
    const name = req.params.name;
    if (!VAULTS[name]) {
      return res.status(404).json({ error: `Vault '${name}' not found` });
    }
    const routing = getRoutingForVault(name, VAULT_ROUTING);
    const conventionsFile = routing?.conventionsFile || 'roadmap-conventions.md';
    const conventionsPath = path.join(VAULTS[name], conventionsFile);
    try {
      const content = await fs.readFile(conventionsPath, 'utf-8');
      res.json({ conventionsPath, content });
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'conventions file not found', conventionsPath });
      }
      throw err;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vaults/:name/git/sync - Commit (optional message) and push
app.post('/api/vaults/:name/git/sync', async (req, res) => {
  try {
    const name = req.params.name;
    if (!VAULTS[name]) {
      return res.status(404).json({ error: `Vault '${name}' not found` });
    }
    const vaultDir = VAULTS[name];
    const { message, push: doPush = true } = req.body || {};
    const commitMessage = message || `roadmap: sync from Kando (${new Date().toISOString()})`;
    const opts = getVaultGitOptions(name);

    let result;
    if (doPush) {
      result = await syncVault(vaultDir, commitMessage, {
        remote: opts.remote,
        branch: opts.branch,
        pullIfBehind: true,
      });
    } else {
      result = await commitAll(vaultDir, commitMessage);
    }

    const status = await getGitStatus(vaultDir);
    res.json({ success: true, ...result, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cursor/open - Attempt to open a card in Cursor
app.post('/api/cursor/open', async (req, res) => {
  try {
    const { spawn } = await import('child_process');
    const { cardPath, vault } = req.body;
    const vaultDir = getVaultDir({ query: { vault } });
    const fullPath = path.join(vaultDir, cardPath);

    // Try to spawn Cursor with the file
    const cursorProcess = spawn('cursor', [fullPath], {
      detached: true,
      stdio: 'ignore'
    });

    cursorProcess.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to spawn Cursor', details: err.message });
      }
    });

    cursorProcess.unref();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static files from electron directory
app.use(express.static(__dirname));

// Catch-all route for client-side routing - serve app.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

// Start server
async function start() {
  await loadVaultsConfig();

  app.listen(PORT, () => {
    console.log(`Kanban API server running on http://localhost:${PORT}`);
    console.log(`Available vaults: ${Object.keys(VAULTS).join(', ')}`);
    console.log(`GET /api/cards?vault=<name> - List all cards`);
    console.log(`GET /api/cards/:cardId?vault=<name> - Get card details`);
    console.log(`PUT /api/cards/:cardId?vault=<name> - Update card metadata`);
    console.log(`PUT /api/cards/:cardId/content?vault=<name> - Update card content`);
    console.log(`GET /api/roadmap-index?vault=<name> - Read index section order`);
    console.log(`PUT /api/roadmap-index?vault=<name> - Update index section order`);
    console.log(`GET /api/agent-suggestions?vault=<name> - Read agent-suggestions.md`);
    console.log(`GET /api/vaults/:name/conventions - Read roadmap-conventions.md`);
    console.log(`GET /api/strategy?vault=<name> - Read strategy horizon membership`);
    console.log(`PUT /api/strategy?vault=<name> - Update strategy horizon membership`);
    console.log(`GET /api/vaults - List available vaults (includes routing metadata)`);
    console.log(`GET /api/routing/resolve?workspaceRoot=<path> - Resolve vault for workspace`);
    console.log(`POST /api/vaults/add - Add new vault`);
    console.log(`DELETE /api/vaults/:name - Remove vault`);
  });
}

start();
