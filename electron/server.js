import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const app = express();
const PORT = 3001;

// Get __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Vaults configuration file
const VAULTS_CONFIG_FILE = './vaults.json';

// Default vaults: sibling checkout layout —
//   /dev/kando/electron/server.js  →  /dev/venubase/venubase-web/docs/roadmap
// Override with VENUBASE_ROADMAP_DIR (absolute path) for nonstandard layouts.
const DEFAULT_VENUBASE_ROADMAP = process.env.VENUBASE_ROADMAP_DIR
  ? path.resolve(process.env.VENUBASE_ROADMAP_DIR)
  : path.resolve(__dirname, '../../venubase/venubase-web/docs/roadmap');

const DEFAULT_VAULTS = {
  venubase: DEFAULT_VENUBASE_ROADMAP,
};

let DEFAULT_VAULT = 'venubase';
let VAULTS = { ...DEFAULT_VAULTS };
let VAULT_COLORS = {
  venubase: '#5b5bd6',
  playerpath: '#8b5cf6',
};

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
    console.log('Loaded vaults from config:', Object.keys(VAULTS));
    console.log('Default vault:', DEFAULT_VAULT);
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
      default: DEFAULT_VAULT
    };
    await fs.writeFile(VAULTS_CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Failed to save vaults config:', err.message);
  }
}

app.use(cors());
app.use(express.json());

// Helper to get vault directory from request
function getVaultDir(req) {
  const vault = req.query.vault || DEFAULT_VAULT;
  // Try exact match first, then case-insensitive match
  if (VAULTS[vault]) return VAULTS[vault];
  const lowerVault = vault.toLowerCase();
  const matchedVault = Object.keys(VAULTS).find(k => k.toLowerCase() === lowerVault);
  return matchedVault ? VAULTS[matchedVault] : VAULTS[DEFAULT_VAULT];
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

// Helper to load kanban config from vault directory
async function loadKanbanConfig(vaultDir) {
  try {
    const configPath = path.join(vaultDir, 'kanban.json');
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// Helper to save kanban config to vault directory
async function saveKanbanConfig(vaultDir, config) {
  try {
    const configPath = path.join(vaultDir, 'kanban.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch (err) {
    console.error('Failed to save kanban config:', err);
    return false;
  }
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
            status: data.status || 'Backlog',
            roadmap_order: data.roadmap_order || null,
            category: data.category || null,
            plan_anchor: data.plan_anchor || null,
            path: file,
            shipped_at: data.shipped_at || null,
          });
        }
      } catch (err) {
        console.error(`Error reading ${file}:`, err.message);
      }
    }

    // Sort by roadmap_order (nulls last), then by id
    cards.sort((a, b) => {
      if (a.roadmap_order === null && b.roadmap_order === null) return a.id.localeCompare(b.id);
      if (a.roadmap_order === null) return 1;
      if (b.roadmap_order === null) return -1;
      return a.roadmap_order - b.roadmap_order;
    });

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

    res.json({
      id: cardId,
      title: data.plan_anchor || cardId,
      status: data.status || 'Backlog',
      roadmap_order: data.roadmap_order || null,
      category: data.category || null,
      plan_anchor: data.plan_anchor || null,
      path: `${cardId}.md`,
      shipped_at: data.shipped_at || null,
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

    // Reconstruct markdown with updated frontmatter
    const updatedContent = matter.stringify(markdownContent, orderedData);
    await fs.writeFile(cardPath, updatedContent, 'utf-8');

    res.json({ id: cardId, success: true });
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

    res.json({ id: cardId, success: true });
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
        kanban: kanbanConfig
      });
    }
    res.json({ vaults: vaultList, default: DEFAULT_VAULT });
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
    const config = await loadKanbanConfig(vaultDir);
    if (!config) {
      return res.status(404).json({ error: 'Kanban config not found' });
    }

    if (columns) {
      config.columns = columns;
    }
    if (settings) {
      config.settings = { ...config.settings, ...settings };
    }

    const saved = await saveKanbanConfig(vaultDir, config);
    if (!saved) {
      return res.status(500).json({ error: 'Failed to save kanban config' });
    }

    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cursor/open - Attempt to open a card in Cursor
app.post('/api/cursor/open', async (req, res) => {
  try {
    const { spawn } = await import('child_process');
    const { cardId, cardPath, vault } = req.body;
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
    console.log(`GET /api/vaults - List available vaults`);
    console.log(`POST /api/vaults/add - Add new vault`);
    console.log(`DELETE /api/vaults/:name - Remove vault`);
  });
}

start();
