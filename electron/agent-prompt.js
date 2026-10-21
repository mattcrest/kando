/**
 * Builds the "Copy agent prompt" text for a card.
 *
 * Pure functions only — the server gathers files (card, parents, conventions,
 * the vault's agent-prompt.md) and passes them in, so this stays unit-testable.
 */

import matter from 'gray-matter';

export const DEFAULT_AGENT_PROMPT_FILE = 'agent-prompt.md';

/** Parent sections worth carrying into an implementer's prompt. */
const EPIC_SECTIONS = ['Summary', 'Out of scope', 'Notes'];
const INITIATIVE_SECTIONS = ['Summary'];

/**
 * Return the body of a `## Heading` section (without the heading line), or ''.
 * Matches the heading case-insensitively; stops at the next heading of the same
 * or higher level.
 */
export function extractSection(markdown, heading, level = 2) {
  if (!markdown) return '';
  const lines = String(markdown).split('\n');
  const marker = '#'.repeat(level);
  const want = heading.trim().toLowerCase();
  const headingRe = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = headingRe.exec(lines[i]);
    if (!m) continue;
    if (start === -1) {
      if (m[1] === marker && m[2].trim().toLowerCase() === want) start = i + 1;
    } else if (m[1].length <= level) {
      return lines.slice(start, i).join('\n').trim();
    }
  }
  return start === -1 ? '' : lines.slice(start).join('\n').trim();
}

/** Split raw card text into its frontmatter block (as written) and body. */
export function splitFrontmatter(raw) {
  const text = String(raw || '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { frontmatterText: '', body: text.trim() };
  return { frontmatterText: m[1].trim(), body: text.slice(m[0].length).trim() };
}

/**
 * Parse a vault's agent-prompt.md: frontmatter may declare the repo work happens
 * in (`implementation_repo`, string or list); the body is project notes appended
 * to every prompt.
 */
export function parseAgentPromptFile(raw) {
  if (!raw || !String(raw).trim()) return { implementationRepos: [], notes: '' };
  const { data, content } = matter(String(raw));
  const repos = data.implementation_repo ?? data.implementation_repos ?? [];
  return {
    implementationRepos: (Array.isArray(repos) ? repos : [repos]).map(String).filter(Boolean),
    notes: stripLeadingH1(stripHtmlComments(content).trim()),
  };
}

/** Editor guidance in agent-prompt.md lives in HTML comments; keep it out of prompts. */
function stripHtmlComments(markdown) {
  return markdown.replace(/<!--[\s\S]*?-->\s*/g, '');
}

function stripLeadingH1(markdown) {
  return markdown.replace(/^#\s+.*\n+/, '').trim();
}

function cardLabel(card) {
  return String(card.plan_anchor || card.title || card.id).trim();
}

function kindLabel(card) {
  if (card.is_initiative) return 'initiative';
  if (card.is_epic) return 'epic';
  return 'slice';
}

function parentBlock(parent) {
  const sections = parent.card.is_initiative ? INITIATIVE_SECTIONS : EPIC_SECTIONS;
  const kind = kindLabel(parent.card);
  const { body } = splitFrontmatter(parent.raw);
  const parts = [`### ${kind[0].toUpperCase()}${kind.slice(1)}: ${cardLabel(parent.card)} (${parent.card.id})`];
  for (const name of sections) {
    const text = extractSection(body, name);
    if (text) parts.push(`**${name}**\n\n${text}`);
  }
  return parts.join('\n\n');
}

/**
 * @param {object} input
 * @param {object} input.card            Card metadata (id, title, plan_anchor, status, is_epic, is_initiative, path)
 * @param {string} input.cardRaw         Full card file text (frontmatter + body)
 * @param {Array<{card: object, raw: string}>} [input.ancestors]  Outermost first (initiative, epic)
 * @param {string} [input.vaultKey]
 * @param {string} [input.canonicalRepo] Roadmap vault repo (owner/name)
 * @param {string[]} [input.implementationRepos] App repo(s) the work happens in
 * @param {string} [input.conventionsText]
 * @param {string} [input.conventionsFile]
 * @param {string} [input.projectNotes]  Body of the vault's agent-prompt.md
 * @param {string} [input.agentPromptFile]
 */
export function buildAgentPrompt(input) {
  const {
    card,
    cardRaw,
    ancestors = [],
    vaultKey = '',
    canonicalRepo = null,
    implementationRepos = [],
    conventionsText = '',
    conventionsFile = 'roadmap-conventions.md',
    projectNotes = '',
    agentPromptFile = DEFAULT_AGENT_PROMPT_FILE,
  } = input;

  const cardFile = card.path || `${card.id}.md`;
  const kind = kindLabel(card);
  const { frontmatterText, body } = splitFrontmatter(cardRaw);
  const crumb = ancestors.map((a) => cardLabel(a.card)).concat([cardLabel(card)]).join(' › ');
  const shipChecklist = extractSection(conventionsText, 'When something ships');
  const cardUrl = canonicalRepo ? `https://github.com/${canonicalRepo}/blob/main/${cardFile}` : null;

  const out = [];
  const push = (...lines) => out.push(...lines);

  push(`Task: Implement roadmap ${kind} "${cardLabel(card)}" (${card.id})`, '');
  push(
    "This prompt is self-contained — don't assume you can reach my local machine or Kando's server (http://127.0.0.1:3001). Everything you need is below or in the repositories named here.",
    ''
  );

  push('## Where things live', '');
  if (implementationRepos.length === 1) {
    push(`- **Implement in:** ${implementationRepos[0]}`);
  } else if (implementationRepos.length > 1) {
    push(`- **Implement in one of:** ${implementationRepos.join(', ')} (pick the one the Technical references point at)`);
  } else {
    push('- **Implement in:** the app repository the Technical references link to (not the roadmap vault).');
  }
  if (canonicalRepo) {
    push(`- **Roadmap vault:** ${canonicalRepo}${vaultKey ? ` (vault "${vaultKey}")` : ''} — card file \`${cardFile}\`. Clone it if it isn't in your workspace; you update the card there.`);
  } else {
    push(`- **Roadmap vault:** ${vaultKey || '(unnamed)'} — card file \`${cardFile}\`.`);
  }
  push(`- **Breadcrumb:** ${crumb}`, `- **Current status:** ${card.status || 'unknown'}`, '');

  push('## The card', '');
  push(`<card file="${cardFile}">`);
  if (frontmatterText) push('---', frontmatterText, '---', '');
  push(body || '(No body content found.)', '</card>', '');

  const parentBlocks = ancestors.map(parentBlock).filter(Boolean);
  if (parentBlocks.length) {
    push('## Parent context', '');
    push(
      "Decisions and exclusions recorded on the parent cards apply to this work too. Operator tasks or open questions in their notes are context, not your job, unless the card says otherwise.",
      ''
    );
    push(parentBlocks.join('\n\n'), '');
  }

  if (projectNotes) {
    push(`## Project notes for implementers (${agentPromptFile})`, '');
    push(projectNotes, '');
  }

  push('## Your task', '');
  push('### Step 1 — Orient and verify (before writing code)', '');
  push(
    "1. Read the implementation repo's own agent instructions (CLAUDE.md / AGENTS.md at its root) and follow them.",
    "2. Check every claim in the card's **Technical references** against the current code — paths, line hints, functions, and what the card says already exists. The card may be weeks old.",
    "3. Write a short plan: what you'll change, anything the card got wrong or left out, and any decision you need from me. If a discrepancy changes the scope, stop and ask instead of guessing.",
    ''
  );
  push('### Step 2 — Implement', '');
  push(
    '- **Acceptance criteria** are the definition of done; **Behavior & requirements** are the rules; **Verification protocol** is how to prove it.',
    '- Stay inside the card. Respect **Out of scope** here and on the parent — note follow-ups instead of widening the change.',
    ''
  );
  push('### Step 3 — Deliver', '');
  push(
    "- Run the repo's own checks (lint, typecheck, tests) before pushing; fix what you broke.",
    '- Work on a feature branch and open a pull request.' + (cardUrl ? ' Include this in the PR body:' : ''),
    ...(cardUrl ? ['', '```markdown', '## Roadmap', cardUrl, '```', ''] : []),
    "- Report back: what changed, check results, and anything in the card that turned out to be wrong.",
    ''
  );

  push('## Keep the card current (Kando Workbench)', '');
  push(
    "Update this card's frontmatter in the roadmap vault as you work — Kando's Workbench view shows it to me, so it must reflect reality:",
    '',
    '  agent_status: in_progress | blocked | needs_review | idle   (done or complete also takes the card off the Workbench)',
    '  agent_provider: cursor | claude | codex | manual',
    '  agent_summary: one or two sentences on current state (the "why")',
    '  agent_next: one sentence on what happens next',
    '  agent_updated_at: current ISO 8601 timestamp, updated every time you touch this card',
    '',
    "Update these on every meaningful change, not just at the end. Don't remove or reformat other frontmatter fields. Commit card edits in the roadmap vault repo, not the app repo.",
    ''
  );

  if (shipChecklist) {
    push('## When it ships', '');
    push(`From the vault's ${conventionsFile} — do this after the PR merges:`, '');
    push(shipChecklist, '');
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
