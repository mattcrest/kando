/**
 * "Generate with Claude": runs Claude Code headless and read-only in a local
 * checkout of the implementation repo to verify a card against the code, then
 * splices its findings into the assembled agent prompt.
 *
 * Claude writes only the verified sections; the card text, parent context and
 * delivery steps stay exactly as buildAgentPrompt produced them.
 */

import { spawn as nodeSpawn, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execFileAsync = promisify(execFile);

export const DEFAULT_TIMEOUT_MS = 6 * 60 * 1000;
const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob'];
const BLOCKED_TOOLS = ['Edit', 'Write', 'NotebookEdit', 'Bash', 'WebFetch', 'WebSearch', 'Task', 'Agent'];

/**
 * Pick the local checkout to run in: the first routing workspace root that is a
 * literal path (no glob) and an existing directory.
 */
export async function resolveLocalCheckout(workspaceRoots = [], isDir = defaultIsDir) {
  for (const root of workspaceRoots) {
    if (!root || root.includes('*')) continue;
    if (await isDir(root)) return root;
  }
  return null;
}

async function defaultIsDir(p) {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

export async function gitHead(cwd) {
  try {
    const [{ stdout: sha }, { stdout: branch }] = await Promise.all([
      execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { cwd }),
      execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }),
    ]);
    const name = branch.trim();
    return { sha: sha.trim(), branch: name && name !== 'HEAD' ? name : null };
  } catch {
    return { sha: null, branch: null };
  }
}

/** Instruction for the read-only verification pass. */
export function buildGeneratorInstruction(basePrompt, { repoLabel = 'this repository', head = {} } = {}) {
  const at = head.sha ? ` at ${head.branch ? `${head.branch} ` : ''}${head.sha}` : '';
  return [
    `You are preparing a handoff for another coding agent who will implement a roadmap card in ${repoLabel} (your current working directory${at}).`,
    '',
    'Below, between <draft> tags, is the prompt that agent will receive. Your job is to check the card against the actual code and write the findings that will be added to it. Read only: do not edit files, run commands, or make commits.',
    '',
    'Do this:',
    "1. Check every claim in the card's Technical references: does each path exist, is each function or component where the card says, and is what the card says already exists actually there? When something moved, find where it is now.",
    '2. Find what the implementer will need: the files to change, existing tests to extend, the latest definition of any SQL function or RPC that must change (search the migrations; the newest file defining it wins), and generated files they must regenerate.',
    '3. Look for scope traps: shared code that changes other products, behavior that is bigger than the card suggests, or anything that conflicts with Out of scope.',
    '',
    'Output only Markdown, with no text before or after it, using exactly these sections:',
    '',
    '## Verified against the code',
    '- One bullet per Technical reference or claim: ✅ confirmed, or ⚠️ wrong/moved with the correct path or fact.',
    '',
    '## Files and tests to touch',
    '- The concrete files to change and the test files to extend, each with a few words on why.',
    '',
    '## Watch out for',
    '- Gotchas and scope traps you found. Write "- Nothing beyond the project notes." if none.',
    '',
    '## Open questions',
    '- Ambiguities the implementer should raise before building. Write "- None." if none.',
    '',
    'Be concrete and brief: repo-relative paths, function names, no restating the card. Do not invent requirements.',
    '',
    '<draft>',
    basePrompt,
    '</draft>',
  ].join('\n');
}

/** Keep Claude's sections only, dropping any preamble before the first heading. */
export function cleanFindings(text) {
  const s = String(text || '').trim();
  const i = s.indexOf('## ');
  return (i === -1 ? s : s.slice(i)).trim();
}

/**
 * Insert findings after "## Where things live" (before "## The card").
 */
export function spliceFindings(basePrompt, findings, { repoLabel, head = {}, generatedAt } = {}) {
  const body = cleanFindings(findings);
  if (!body) return basePrompt;
  const when = generatedAt ? generatedAt.slice(0, 10) : '';
  const at = [repoLabel, head.branch, head.sha].filter(Boolean).join(' @ ');
  const intro = `_Checked by Claude Code against ${at || 'the code'}${when ? ` on ${when}` : ''}. Re-verify anything that looks off; the code may have moved since._`;
  const block = `${intro}\n\n${body.replace(/^## /gm, '### ')}`;
  const marker = '\n## The card\n';
  const idx = basePrompt.indexOf(marker);
  const section = `\n## Checked against the code\n\n${block}\n`;
  if (idx === -1) return `${basePrompt.trimEnd()}\n${section}`;
  return `${basePrompt.slice(0, idx)}${section}${basePrompt.slice(idx)}`;
}

/**
 * Run `claude -p` with read-only tools. Resolves { text, costUsd }.
 * `spawnFn` is injectable for tests.
 */
export function runClaude({
  cwd,
  input,
  bin = process.env.KANDO_CLAUDE_BIN || 'claude',
  model = process.env.KANDO_CLAUDE_MODEL || null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  spawnFn = nodeSpawn,
}) {
  const args = [
    '-p',
    '--output-format', 'json',
    '--allowedTools', ...READ_ONLY_TOOLS,
    '--disallowedTools', ...BLOCKED_TOOLS,
  ];
  if (model) args.push('--model', model);

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnFn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      reject(new Error(`Could not start ${bin}: ${err.message}`));
      return;
    }
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(reject, new Error(`Claude Code did not finish within ${Math.round(timeoutMs / 60000)} minutes`));
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (err) => {
      const hint = err.code === 'ENOENT' ? ` — install Claude Code or set KANDO_CLAUDE_BIN` : '';
      finish(reject, new Error(`Could not start ${bin}${hint}: ${err.message}`));
    });
    child.on('close', (code) => {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        // fall through
      }
      if (parsed && !parsed.is_error && typeof parsed.result === 'string') {
        finish(resolve, { text: parsed.result, costUsd: parsed.total_cost_usd ?? null });
        return;
      }
      const detail = (parsed?.result || stderr || stdout || `exit code ${code}`).toString().trim().slice(0, 500);
      finish(reject, new Error(`Claude Code failed: ${detail}`));
    });

    child.stdin.end(input);
  });
}
