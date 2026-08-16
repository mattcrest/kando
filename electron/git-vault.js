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

function parseRepoNameFromRemoteUrl(url) {
  if(!url || typeof url !== 'string') return null;
  const cleaned = url.trim().replace(/\/$/, '').replace(/\.git$/, '');
  const parts = cleaned.split(/[:/]/).filter(Boolean);
  return parts[parts.length - 1] || null;
}

/** git@github.com:org/repo.git or https://github.com/org/repo → browser URL */
export function remoteUrlToWebUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim().replace(/\/$/, '');
  const ssh = trimmed.match(/^git@([^:]+):(.+)$/);
  if (ssh) return `https://${ssh[1]}/${ssh[2].replace(/\.git$/, '')}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\.git$/, '');
  return null;
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

/** Best-effort sync of refs/remotes/origin/<branch> after resolving remote tip. */
async function syncRemoteTrackingRef(dir, branch, remoteSha) {
  try {
    await git(dir, 'update-ref', `refs/remotes/origin/${branch}`, remoteSha);
  } catch {
    // lock or permission errors — ahead/behind counts are still accurate
  }
}

/** Resolve origin/<branch> tip; ls-remote is authoritative when local tracking is stale. */
async function getRemoteBranchSha(dir, branch, { fetchRemote = true } = {}) {
  if (fetchRemote) {
    try {
      await runWithSshFallback(dir, async (remote) => {
        await git(dir, 'fetch', remote, branch, '--quiet');
        return {};
      });
      const sha = await git(dir, 'rev-parse', `origin/${branch}`);
      await syncRemoteTrackingRef(dir, branch, sha);
      return sha;
    } catch {
      // fetch failed — fall back to ls-remote
    }
  }

  const sha = await runWithSshFallback(dir, async (remote) => {
    const out = await git(dir, 'ls-remote', '--heads', remote, branch);
    const tip = out.split(/\s+/)[0];
    if (!tip) throw new Error(`Remote branch ${branch} not found`);
    return tip;
  });

  await syncRemoteTrackingRef(dir, branch, sha);
  return sha;
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

  let remoteUrl = null;
  let repoName = null;
  let repoWebUrl = null;
  try {
    remoteUrl = await getOriginUrl(dir);
    repoName = parseRepoNameFromRemoteUrl(remoteUrl);
    repoWebUrl = remoteUrlToWebUrl(remoteUrl);
  } catch {
    // no origin remote
  }

  let ahead = 0;
  let behind = 0;
  let hasUpstream = false;

  try {
    const remoteSha = await getRemoteBranchSha(dir, branch, { fetchRemote });
    const counts = await git(dir, 'rev-list', '--left-right', '--count', `${remoteSha}...HEAD`);
    const [beh, ah] = counts.split(/\s+/).map(Number);
    ahead = ah || 0;
    behind = beh || 0;
    hasUpstream = true;
  } catch {
    // offline or no remote
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
    remoteUrl,
    repoName,
    repoWebUrl,
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
  let pulled = false;
  if (pullIfBehind) {
    const status = await getGitStatus(dir, { fetchRemote: true });
    if (status.behind > 0) {
      await pullRebase(dir, remote, branch || status.branch);
      pulled = true;
    }
  }
  const result = await commitAndPush(dir, message, { remote, branch });
  return { ...result, pulled };
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
    const output = await git(dir, 'push', remoteTarget, ref);
    const alreadyUpToDate = /everything up-to-date/i.test(output);
    try {
      const remoteSha = await git(dir, 'ls-remote', '--heads', remoteTarget, ref);
      const sha = remoteSha.split(/\s+/)[0];
      if (sha) await syncRemoteTrackingRef(dir, ref, sha);
    } catch {
      // counts will refresh on next getGitStatus
    }
    return {
      pushed: !alreadyUpToDate,
      alreadyUpToDate,
      remote: remoteTarget,
      branch: ref,
      ...meta,
    };
  });
}

export async function commitAndPush(dir, message, { remote = 'origin', branch } = {}) {
  const commitResult = await commitAll(dir, message);
  if (!commitResult.committed) {
    const status = await getGitStatus(dir, { fetchRemote: true });
    if (status.ahead === 0) {
      return { ...commitResult, pushed: false };
    }
  }
  const pushResult = await push(dir, remote, branch);
  return { ...commitResult, ...pushResult };
}

const LOG_START = '\x02';
const LOG_FIELD_SEP = '\x1f';
const LOG_END = '\x03';

/** GitHub "Create a merge commit" style: "Merge pull request #4 from owner/branch". */
const MERGE_COMMIT_RE = /^Merge pull request #(\d+) from (\S+)/i;
/** GitHub "Squash and merge" style: commit subject ends with " (#4)". */
const SQUASH_MERGE_RE = /^(.*)\(#(\d+)\)\s*$/;

/** Best-effort PR merge detection from a commit's own message — no GitHub API call. */
export function detectMergeInfo({ parents, subject, body }) {
  if (parents.length > 1) {
    const m = subject.match(MERGE_COMMIT_RE);
    if (m) {
      const bodyTitle = body.split('\n').map((l) => l.trim()).find(Boolean);
      return {
        prNumber: Number(m[1]),
        sourceBranch: m[2],
        title: bodyTitle || subject,
      };
    }
  }
  const sq = subject.match(SQUASH_MERGE_RE);
  if (sq) {
    return {
      prNumber: Number(sq[2]),
      sourceBranch: null,
      title: sq[1].trim() || subject,
    };
  }
  return null;
}

export async function getGitLog(dir, { limit = 400 } = {}) {
  if (!(await isGitRepo(dir))) {
    return { isRepo: false, branch: null, commits: [], total: 0, truncated: false };
  }

  const branch = await git(dir, 'rev-parse', '--abbrev-ref', 'HEAD').catch(() => null);

  const format =
    `${LOG_START}%H${LOG_FIELD_SEP}%h${LOG_FIELD_SEP}%P${LOG_FIELD_SEP}` +
    `%an${LOG_FIELD_SEP}%ae${LOG_FIELD_SEP}%ad${LOG_FIELD_SEP}%B${LOG_END}`;

  let raw;
  try {
    raw = await git(
      dir,
      'log',
      `--max-count=${limit + 1}`,
      `--pretty=format:${format}`,
      '--date=iso-strict',
      '--name-only'
    );
  } catch {
    // empty repo (no commits yet)
    return { isRepo: true, branch, commits: [], total: 0, truncated: false };
  }

  const chunks = raw.split(LOG_START).filter(Boolean);
  const parsed = [];
  for (const chunk of chunks) {
    const endIdx = chunk.indexOf(LOG_END);
    if (endIdx === -1) continue;
    const meta = chunk.slice(0, endIdx);
    const filesRaw = chunk.slice(endIdx + 1);
    const [hash, shortHash, parentsRaw, authorName, authorEmail, date, rawBody] =
      meta.split(LOG_FIELD_SEP);
    if (!hash) continue;

    const parents = (parentsRaw || '').trim().split(/\s+/).filter(Boolean);
    const fullMessage = (rawBody || '').replace(/\n+$/, '');
    const subject = fullMessage.split('\n')[0] || '';
    const body = fullMessage.slice(subject.length).trim();
    const files = filesRaw
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean);

    parsed.push({
      hash,
      shortHash,
      parents,
      isMerge: parents.length > 1,
      authorName,
      authorEmail,
      date,
      subject,
      body,
      files,
      mergeInfo: detectMergeInfo({ parents, subject, body }),
    });
  }

  const truncated = parsed.length > limit;
  const commits = truncated ? parsed.slice(0, limit) : parsed;

  return { isRepo: true, branch, commits, total: commits.length, truncated };
}
