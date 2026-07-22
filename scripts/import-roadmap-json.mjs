#!/usr/bin/env node
/**
 * import-roadmap-json — one-time, additive migration.
 *
 * Derives a vault's roadmap.json from its current card frontmatter (`status`)
 * and roadmap-index.md order. Writes ONLY roadmap.json; never touches Markdown.
 * Idempotent: re-running against an unchanged vault produces no diff.
 *
 * Usage:
 *   node scripts/import-roadmap-json.mjs <vault-dir> [--dry-run]
 *   node scripts/import-roadmap-json.mjs --vault <key> [--dry-run]   # resolve via vaults.json
 *
 * See docs/roadmap-json.md.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import {
  buildRoadmapConfig,
  serializeConfig,
  loadRoadmapConfig,
  normalizeStatus,
  ROADMAP_FILENAME,
} from '../electron/roadmap-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

async function resolveVaultDir(args) {
  const vaultFlagIdx = args.indexOf('--vault');
  if (vaultFlagIdx !== -1) {
    const key = args[vaultFlagIdx + 1];
    if (!key) throw new Error('--vault requires a vault key');
    const configPath = path.join(REPO_ROOT, 'vaults.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    const dir = config.vaults?.[key];
    if (!dir) throw new Error(`Vault '${key}' not found in vaults.json`);
    return { vaultDir: path.resolve(dir), indexFile: config.routing?.[key]?.indexFile || 'roadmap-index.md' };
  }
  const positional = args.find((a) => !a.startsWith('--'));
  if (!positional) throw new Error('Provide a vault directory or --vault <key>');
  return { vaultDir: path.resolve(positional), indexFile: 'roadmap-index.md' };
}

/** Read release-card metadata the importer needs. Content is never modified. */
async function collectCards(vaultDir) {
  const files = (await fs.readdir(vaultDir)).filter((f) => f.endsWith('.md'));
  const cards = [];
  for (const file of files) {
    try {
      const content = await fs.readFile(path.join(vaultDir, file), 'utf-8');
      const { data } = matter(content);
      if (data.release !== true) continue;
      const id = file.replace(/\.md$/, '');
      cards.push({
        id,
        status: normalizeStatus(data.status),
        roadmap_order: data.roadmap_order ?? null,
        shipped_at: data.shipped_at || null,
        is_initiative: data.initiative === true,
        horizon: data.horizon || null,
        title: data.plan_anchor || id,
      });
    } catch (err) {
      console.error(`  ! skipping ${file}: ${err.message}`);
    }
  }
  return cards;
}

async function loadIndexOrders(vaultDir, indexFile) {
  try {
    const raw = await fs.readFile(path.join(vaultDir, indexFile), 'utf-8');
    const { parseRoadmapIndex } = await import('../electron/roadmap-index.js');
    return parseRoadmapIndex(raw).orders;
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const { vaultDir, indexFile } = await resolveVaultDir(args);

  const stat = await fs.stat(vaultDir).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Not a directory: ${vaultDir}`);

  const cards = await collectCards(vaultDir);
  const indexOrders = await loadIndexOrders(vaultDir, indexFile);
  const existing = (await loadRoadmapConfig(vaultDir))?.raw ?? null;

  const config = buildRoadmapConfig({ cards, indexOrders, existing });
  const serialized = serializeConfig(config);
  const outPath = path.join(vaultDir, ROADMAP_FILENAME);

  const before = await fs.readFile(outPath, 'utf-8').catch(() => null);
  const changed = before !== serialized;

  console.log(`vault:   ${vaultDir}`);
  console.log(`cards:   ${cards.length} release card(s)`);
  console.log(`columns: ${config.kanban.columns.map((c) => `${c.key}(${c.cards.length})`).join(' ') || '(none)'}`);
  console.log(`strategy:${config.strategy.horizons.map((h) => `${h.key}(${h.initiatives.length})`).join(' ') || ' (none)'}`);

  if (dryRun) {
    console.log(`\n[dry-run] ${changed ? 'would write' : 'no change to'} ${ROADMAP_FILENAME}\n`);
    console.log(serialized);
    return;
  }

  if (!changed) {
    console.log(`\n${ROADMAP_FILENAME} already up to date — no write.`);
    return;
  }
  await fs.writeFile(outPath, serialized, 'utf-8');
  console.log(`\n${before === null ? 'created' : 'updated'} ${outPath}`);
}

main().catch((err) => {
  console.error(`import-roadmap-json: ${err.message}`);
  process.exit(1);
});
