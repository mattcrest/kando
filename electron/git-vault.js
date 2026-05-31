import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

async function git(cwd, ...args) {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
  });
  return (stdout || stderr || '').trim();
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
      await git(dir, 'fetch', 'origin', branch, '--quiet');
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
  await git(dir, 'pull', '--rebase', remote, ref);
  return { pulled: true, remote, branch: ref };
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
  const status = await getGitStatus(dir);
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
  await git(dir, 'push', remote, ref);
  return { pushed: true, remote, branch: ref };
}

export async function commitAndPush(dir, message, { remote = 'origin', branch } = {}) {
  const commitResult = await commitAll(dir, message);
  if (!commitResult.committed) {
    const status = await getGitStatus(dir);
    if (status.ahead === 0) {
      return { ...commitResult, pushed: false };
    }
  }
  const pushResult = await push(dir, remote, branch);
  return { ...commitResult, ...pushResult };
}
