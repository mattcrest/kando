import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import {
  buildGeneratorInstruction,
  claudeNotFoundMessage,
  cleanFindings,
  loginShellPath,
  resolveClaude,
  resolveLocalCheckout,
  runClaude,
  spliceFindings,
} from '../electron/agent-prompt-generator.js';

const BASE = [
  'Task: Implement roadmap slice "X" (release-x)',
  '',
  '## Where things live',
  '',
  '- **Implement in:** acme/web',
  '',
  '## The card',
  '',
  '<card file="release-x.md">',
  '## Summary',
  '',
  'Do X.',
  '</card>',
  '',
  '## Your task',
  '',
].join('\n');

function fakeSpawn({ stdout = '', stderr = '', code = 0, error = null, hang = false } = {}) {
  const calls = [];
  const spawnFn = (bin, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end: (input) => calls.push({ bin, args, opts, input }) };
    child.kill = () => { child.killed = true; };
    setImmediate(() => {
      if (error) return child.emit('error', error);
      if (hang) return;
      if (stdout) child.stdout.emit('data', stdout);
      if (stderr) child.stderr.emit('data', stderr);
      child.emit('close', code);
    });
    return child;
  };
  return { spawnFn, calls };
}

describe('resolveLocalCheckout', () => {
  it('skips globs and missing paths, returns the first existing directory', async () => {
    const isDir = async (p) => p === '/code/web';
    assert.equal(await resolveLocalCheckout(['/code/web-pr*', '/missing', '/code/web'], isDir), '/code/web');
  });

  it('returns null when nothing usable exists', async () => {
    assert.equal(await resolveLocalCheckout(['/code/*'], async () => true), null);
    assert.equal(await resolveLocalCheckout(undefined), null);
  });
});

describe('buildGeneratorInstruction', () => {
  it('wraps the draft, names the commit, and asks for read-only findings sections', () => {
    const text = buildGeneratorInstruction(BASE, { repoLabel: 'acme/web', head: { branch: 'main', sha: 'abc123' } });
    assert.match(text, /in acme\/web \(your current working directory at main abc123\)/);
    assert.match(text, /Read only: do not edit files/);
    for (const h of ['## Verified against the code', '## Files and tests to touch', '## Watch out for', '## Open questions']) {
      assert.ok(text.includes(h), h);
    }
    assert.ok(text.includes(`<draft>\n${BASE}\n</draft>`));
  });
});

describe('cleanFindings / spliceFindings', () => {
  it('drops preamble before the first heading', () => {
    assert.equal(cleanFindings('Sure! Here you go.\n\n## Verified against the code\n- ok'), '## Verified against the code\n- ok');
  });

  it('inserts findings before the card, demoted one level, leaving the card untouched', () => {
    const out = spliceFindings(BASE, 'Preamble\n## Verified against the code\n- ✅ editor exists\n## Watch out for\n- email previews', {
      repoLabel: 'acme/web',
      head: { branch: 'main', sha: 'abc123' },
      generatedAt: '2026-10-21T20:00:00.000Z',
    });
    const checked = out.indexOf('## Checked against the code');
    assert.ok(checked > out.indexOf('## Where things live'));
    assert.ok(checked < out.indexOf('## The card'));
    assert.match(out, /Checked by Claude Code against acme\/web @ main @ abc123 on 2026-10-21/);
    assert.match(out, /### Verified against the code\n- ✅ editor exists\n### Watch out for/);
    assert.ok(out.includes('<card file="release-x.md">\n## Summary\n\nDo X.\n</card>'));
    assert.doesNotMatch(out, /Preamble/);
  });

  it('returns the base prompt unchanged when there are no findings', () => {
    assert.equal(spliceFindings(BASE, '  '), BASE);
  });
});

describe('runClaude', () => {
  it('runs claude -p read-only in the checkout and returns the result', async () => {
    const { spawnFn, calls } = fakeSpawn({ stdout: JSON.stringify({ result: '## Verified against the code\n- ok', is_error: false, total_cost_usd: 0.12 }) });
    const out = await runClaude({ cwd: '/code/web', input: 'hello', bin: 'claude', spawnFn });
    assert.deepEqual(out, { text: '## Verified against the code\n- ok', costUsd: 0.12 });
    const [{ bin, args, opts, input }] = calls;
    assert.equal(bin, 'claude');
    assert.equal(opts.cwd, '/code/web');
    assert.equal(input, 'hello');
    assert.deepEqual(args.slice(0, 3), ['-p', '--output-format', 'json']);
    const allowed = args.slice(args.indexOf('--allowedTools') + 1, args.indexOf('--disallowedTools'));
    assert.deepEqual(allowed, ['Read', 'Grep', 'Glob']);
    for (const tool of ['Edit', 'Write', 'Bash']) assert.ok(args.includes(tool), tool);
  });

  it('runs with the env it is given (so claude and node resolve from the login PATH)', async () => {
    const { spawnFn, calls } = fakeSpawn({ stdout: JSON.stringify({ result: 'x', is_error: false }) });
    await runClaude({ cwd: '/w', input: '', bin: '/u/.local/bin/claude', env: { PATH: '/u/.local/bin:/usr/bin' }, spawnFn });
    assert.equal(calls[0].bin, '/u/.local/bin/claude');
    assert.equal(calls[0].opts.env.PATH, '/u/.local/bin:/usr/bin');
  });

  it('passes a model override when set', async () => {
    const { spawnFn, calls } = fakeSpawn({ stdout: JSON.stringify({ result: 'x', is_error: false }) });
    await runClaude({ cwd: '/w', input: '', bin: 'claude', model: 'sonnet', spawnFn });
    assert.deepEqual(calls[0].args.slice(-2), ['--model', 'sonnet']);
  });

  it('rejects with the error text when Claude reports an error', async () => {
    const { spawnFn } = fakeSpawn({ stdout: JSON.stringify({ result: 'Not logged in', is_error: true }), code: 1 });
    await assert.rejects(runClaude({ cwd: '/w', input: '', bin: 'claude', spawnFn }), /Claude Code failed: Not logged in/);
  });

  it('explains a missing binary', async () => {
    const err = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
    const { spawnFn } = fakeSpawn({ error: err });
    await assert.rejects(runClaude({ cwd: '/w', input: '', bin: 'claude', spawnFn }), /install Claude Code or set KANDO_CLAUDE_BIN/);
  });

  it('times out and kills a hung process', async () => {
    const { spawnFn } = fakeSpawn({ hang: true });
    await assert.rejects(runClaude({ cwd: '/w', input: '', bin: 'claude', spawnFn, timeoutMs: 20 }), /did not finish/);
  });
});

describe('loginShellPath', () => {
  it('extracts PATH between markers, ignoring shell startup noise', async () => {
    let call;
    const execFileFn = async (shell, args) => {
      call = { shell, args };
      return { stdout: 'Welcome back!\n__KANDO_PATH__/u/.local/bin:/opt/homebrew/bin:/usr/bin__KANDO_PATH__' };
    };
    assert.equal(await loginShellPath({ shell: '/bin/zsh', execFileFn }), '/u/.local/bin:/opt/homebrew/bin:/usr/bin');
    assert.equal(call.shell, '/bin/zsh');
    assert.equal(call.args[0], '-ilc');
  });

  it('returns null when the shell fails or prints no marker', async () => {
    assert.equal(await loginShellPath({ execFileFn: async () => { throw new Error('boom'); } }), null);
    assert.equal(await loginShellPath({ execFileFn: async () => ({ stdout: 'nothing' }) }), null);
  });
});

describe('resolveClaude', () => {
  const exists = (...paths) => async (p) => paths.includes(p);

  it('finds claude on the login shell PATH when the app PATH is minimal (Dock/Finder launch)', async () => {
    const out = await resolveClaude({
      env: { PATH: '/usr/bin:/bin' },
      home: '/u',
      shellPath: async () => '/u/.nvm/versions/node/v22/bin:/usr/bin',
      isExecutable: exists('/u/.nvm/versions/node/v22/bin/claude'),
    });
    assert.equal(out.bin, '/u/.nvm/versions/node/v22/bin/claude');
    assert.equal(out.env.PATH.split(':')[0], '/usr/bin');
    assert.ok(out.env.PATH.includes('/u/.nvm/versions/node/v22/bin'), 'node for npm-installed claude');
  });

  it('falls back to common install dirs, e.g. the alias-only ~/.claude/local', async () => {
    const out = await resolveClaude({
      env: { PATH: '/usr/bin' },
      home: '/u',
      shellPath: async () => null,
      isExecutable: exists('/u/.claude/local/claude'),
    });
    assert.equal(out.bin, '/u/.claude/local/claude');
  });

  it('honors KANDO_CLAUDE_BIN, and reports a bad override', async () => {
    const good = await resolveClaude({ env: { PATH: '', KANDO_CLAUDE_BIN: '/x/claude' }, shellPath: async () => null, isExecutable: exists('/x/claude') });
    assert.equal(good.bin, '/x/claude');
    const bad = await resolveClaude({ env: { PATH: '', KANDO_CLAUDE_BIN: '/x/nope' }, shellPath: async () => null, isExecutable: exists() });
    assert.equal(bad.bin, null);
    assert.match(claudeNotFoundMessage({ searched: bad.searched, fromOverride: true }), /KANDO_CLAUDE_BIN is set to "\/x\/nope"/);
  });

  it('returns null with everywhere it looked when claude is missing', async () => {
    const out = await resolveClaude({ env: { PATH: '/usr/bin' }, home: '/u', shellPath: async () => null, isExecutable: exists() });
    assert.equal(out.bin, null);
    const msg = claudeNotFoundMessage({ searched: out.searched });
    assert.match(msg, /couldn't find Claude Code/);
    assert.match(msg, /which claude/);
    assert.match(msg, /\/u\/\.local\/bin/);
  });
});
