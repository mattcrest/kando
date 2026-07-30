#!/usr/bin/env node
/**
 * Generate templates/agent-pack/card-contract.json from electron/card-contract.js.
 * Run after changing the card contract SSOT.
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { cardContract, loadCardTemplates } from '../electron/card-contract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'templates/agent-pack');
const OUT_FILE = path.join(OUT_DIR, 'card-contract.json');
const TEMPLATES_OUT = path.join(OUT_DIR, 'templates');

async function main() {
  const templates = await loadCardTemplates();
  const contract = cardContract({
    vaultKey: '_generic',
    storage: 'frontmatter-index',
    columnKeys: ['Backlog', 'Prioritized', 'Active', 'Blocked', 'Done', 'Deferred'],
    templates,
  });

  // Static pack export — no vault-specific placement assumptions beyond defaults.
  const payload = {
    ...contract,
    generatedAt: new Date().toISOString(),
    source: 'electron/card-contract.js',
    note: 'Generic export for offline/cloud agents. Vault-specific storage mode and statuses come from the live API when Kando is running.',
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(TEMPLATES_OUT, { recursive: true });
  await fs.writeFile(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);

  for (const [kind, content] of Object.entries(templates)) {
    if (content) {
      await fs.writeFile(path.join(TEMPLATES_OUT, `${kind}.md`), content);
    }
  }

  console.log(`Wrote ${OUT_FILE}`);
  console.log(`Wrote templates to ${TEMPLATES_OUT}/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
