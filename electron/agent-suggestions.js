import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/;
const RATIONALE_SEP_RE = /^\s*[—–-]\s*/;

export const AGENT_SUGGESTIONS_FILENAME = 'agent-suggestions.md';

/**
 * Parse agent-suggestions.md into frontmatter + an ordered list of
 * { cardId, rationale }. List lines look like:
 *   1. [[release-foo-slug]] — Unblocks the POS launch checklist.
 */
export function parseAgentSuggestions(raw) {
  const { data: frontmatter, content: body } = matter(raw);
  const items = [];

  for (const line of body.split('\n')) {
    const wiki = line.match(WIKI_LINK_RE);
    if (!wiki) continue;
    const cardId = wiki[1].trim();
    const afterLink = line.slice(wiki.index + wiki[0].length);
    const rationale = afterLink.replace(RATIONALE_SEP_RE, '').trim();
    items.push({ cardId, rationale });
  }

  return {
    frontmatter: {
      generated_at: frontmatter.generated_at || null,
      generated_by: frontmatter.generated_by || null,
      context: frontmatter.context || null,
    },
    items,
  };
}

export function defaultAgentSuggestionsPath(vaultDir, filename = AGENT_SUGGESTIONS_FILENAME) {
  return path.join(vaultDir, filename);
}

export async function readAgentSuggestionsFile(vaultDir, filename = AGENT_SUGGESTIONS_FILENAME) {
  try {
    return await fs.readFile(defaultAgentSuggestionsPath(vaultDir, filename), 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function loadAgentSuggestions(vaultDir, filename = AGENT_SUGGESTIONS_FILENAME) {
  const raw = await readAgentSuggestionsFile(vaultDir, filename);
  if (!raw) return null;
  return parseAgentSuggestions(raw);
}
