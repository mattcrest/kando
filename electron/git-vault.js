import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function gitError(err) {
  const message = [err.stderr, err.stdout, err.message].filter(Boolean).join('\n').trim();
  const e = new Error(message || 'git command failed');
  e.stderr = err.stderr;
  e.stdout = err.stdout;
  e.code = err.code;
  return e;
}

async function git(cwd, ...args) {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
    });
    return (stdout || stderr || '').trim();
  } catch (err) {
    throw gitError(err);
  }
}

/** HTTPS GitHub remotes often fail in non-interactive servers (no credential prompt). */
function isAuthError(err) {
  const text = `${err.stderr || ''}\n${err.message || ''}`.toLowerCase();
  return (
    text.includes('could not read username') ||
    text.includes('device not configured') ||
    text.includes('authentication failed') ||
    text.includes('invalid username or password') ||
    text.includes('terminal prompts disabled')
  );
}

/** https://github.com/org/repo.git → git@github.com:org/repo.git */
export function httpsRemoteToSsh(url) {
  const trimmed = (url || '').trim().replace(/\/$/, '');
  const m = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/i);
  if (!m) return null;
  const repo = m[2].endsWith('.git') ? m[2] : `${m[2]}.git`;
  return `git@github.com:${m[1]}/${repo}`;
}

async function getOriginUrl(dir) {
  return git(dir, 'remote', 'get-url', 'origin');
}

async function runWithSshFallback(dir, run) {
  try {
    return await run('origin');
  } catch (err) {
    if (!isAuthError(err)) throw err;
    const originUrl = await getOriginUrl(dir).catch(() => null);
    const sshUrl = originUrl ? httpsRemoteToSsh(originUrl) : null;
    if (!sshUrl) throw err;
    return await run(sshUrl, { usedSsh: true });
  }
}

export async function isGitRepo(dir) {
  try {
    await git(dir, 'rev-parse', '--git-dir');
    return true;
  } catch {
    return false;
  }
}

export async function getGitStatus(dir, { fetchRemote = true } = {}) {
  if (!(await isGitRepo(dir))) {
    return {
      isRepo: false,
      clean: true,
      branch: null,
      changed: [],
      ahead: 0,
      behind: 0,
      syncedWithRemote: true,
      needsSync: false,
    };
  }

  const branch = await git(dir, 'rev-parse', '--abbrev-ref', 'HEAD').catch(() => 'HEAD');
  const porcelain = await git(dir, 'status', '--porcelain').catch(() => '');
  const changed = porcelain
    ? porcelain.split('\n').filter(Boolean).map((line) => line.slice(3))
    : [];
  const clean = changed.length === 0;

  let ahead = 0;
  let behind = 0;
  let hasUpstream = false;

  if (fetchRemote) {
    try {
      await runWithSshFallback(dir, async (remote) => {
        await git(dir, 'fetch', remote, branch, '--quiet');
        return {};
      });
    } catch {
      // offline or no remote — fall back to local upstream tracking
    }
  }

  try {
    const counts = await git(dir, 'rev-list', '--left-right', '--count', `origin/${branch}...HEAD`);
    const [beh, ah] = counts.split(/\s+/).map(Number);
    ahead = ah || 0;
    behind = beh || 0;
    hasUpstream = true;
  } catch {
    // no upstream yet
  }

  const syncedWithRemote = clean && ahead === 0 && behind === 0;
  const needsSync = !syncedWithRemote;

  return {
    isRepo: true,
    clean,
    branch,
    changed,
    ahead,
    behind,
    hasUpstream,
    upstream: hasUpstream ? `origin/${branch}` : null,
    syncedWithRemote,
    needsSync,
  };
}

export async function pullRebase(dir, remote = 'origin', branch) {
  if (!(await isGitRepo(dir))) {
    throw new Error('Vault directory is not a git repository');
  }
  const ref = branch || (await git(dir, 'rev-parse', '--abbrev-ref', 'HEAD'));

  const result = await runWithSshFallback(dir, async (remoteTarget, meta = {}) => {
    await git(dir, 'pull', '--rebase', remoteTarget, ref);
    return { pulled: true, remote: remoteTarget, branch: ref, ...meta };
  });

  return result;
}

export async function syncVault(dir, message, { remote = 'origin', branch, pullIfBehind = true } = {}) {
  if (pullIfBehind) {
    const status = await getGitStatus(dir, { fetchRemote: true });
    if (status.behind > 0) {
      await pullRebase(dir, remote, branch || status.branch);
    }
  }
  return commitAndPush(dir, message, { remote, branch });
}

export async function commitAll(dir, message) {
  if (!(await isGitRepo(dir))) {
    throw new Error('Vault directory is not a git repository');
  }
  const status = await getGitStatus(dir, { fetchRemote: false });
  if (status.clean) {
    return { committed: false, message: 'Nothing to commit' };
  }
  await git(dir, 'add', '-A');
  await git(dir, 'commit', '-m', message);
  return { committed: true, message };
}

export async function push(dir, remote = 'origin', branch) {
  if (!(await isGitRepo(dir))) {
    throw new Error('Vault directory is not a git repository');
  }
  const ref = branch || (await git(dir, 'rev-parse', '--abbrev-ref', 'HEAD'));

  return runWithSshFallback(dir, async (remoteTarget, meta = {}) => {
    await git(dir, 'push', remoteTarget, ref);
    return { pushed: true, remote: remoteTarget, branch: ref, ...meta };
  });
}

export async function commitAndPush(dir, message, { remote = 'origin', branch } = {}) {
  const commitResult = await commitAll(dir, message);
  if (!commitResult.committed) {
    const status = await getGitStatus(dir, { fetchRemote: false });
    if (status.ahead === 0) {
      return { ...commitResult, pushed: false };
    }
  }
  const pushResult = await push(dir, remote, branch);
  return { ...commitResult, ...pushResult };
}
