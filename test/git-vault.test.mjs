import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { getGitLog, detectMergeInfo } from '../electron/git-vault.js';

function git(dir, ...args) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf-8' });
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kando-git-vault-'));
  git(dir, 'init', '--quiet', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test User');
  return dir;
}

function commit(dir, file, contents, message) {
  fs.writeFileSync(path.join(dir, file), contents);
  git(dir, 'add', '-A');
  git(dir, 'commit', '--quiet', '-m', message);
  return git(dir, 'rev-parse', 'HEAD').trim();
}

test('getGitLog: empty (non-git) directory reports isRepo:false', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kando-git-vault-none-'));
  const log = await getGitLog(dir);
  assert.equal(log.isRepo, false);
  assert.deepEqual(log.commits, []);
});

test('getGitLog: brand-new repo with no commits yet', async () => {
  const dir = makeRepo();
  const log = await getGitLog(dir);
  assert.equal(log.isRepo, true);
  assert.deepEqual(log.commits, []);
});

test('getGitLog: plain commits are not treated as merges', async () => {
  const dir = makeRepo();
  commit(dir, 'a.txt', 'one', 'First commit');
  commit(dir, 'a.txt', 'two', 'Second commit\n\nSome body text.');

  const log = await getGitLog(dir);
  assert.equal(log.commits.length, 2);
  assert.equal(log.commits[0].subject, 'Second commit');
  assert.equal(log.commits[0].body, 'Some body text.');
  assert.equal(log.commits[0].isMerge, false);
  assert.equal(log.commits[0].mergeInfo, null);
  assert.deepEqual(log.commits[0].files, ['a.txt']);
});

test('getGitLog: real merge commit (GitHub "Create a merge commit") is detected as a PR merge', async () => {
  const dir = makeRepo();
  commit(dir, 'a.txt', 'base', 'Initial commit');
  git(dir, 'checkout', '--quiet', '-b', 'feature/thing');
  commit(dir, 'b.txt', 'feature', 'Add the feature');
  git(dir, 'checkout', '--quiet', 'main');
  git(
    dir,
    '-c', 'user.email=test@example.com',
    '-c', 'user.name=Test User',
    'merge', '--no-ff', '--quiet',
    '-m', 'Merge pull request #7 from mattcrest/feature/thing\n\nAdd the feature',
    'feature/thing'
  );

  const log = await getGitLog(dir);
  const mergeCommit = log.commits.find((c) => c.isMerge);
  assert.ok(mergeCommit, 'expected a merge commit');
  assert.equal(mergeCommit.parents.length, 2);
  assert.deepEqual(mergeCommit.mergeInfo, {
    prNumber: 7,
    sourceBranch: 'mattcrest/feature/thing',
    title: 'Add the feature',
  });
});

test('getGitLog: squash-merge style commit ("... (#N)") is detected as a PR merge', async () => {
  const dir = makeRepo();
  commit(dir, 'a.txt', 'one', 'Add the feature (#12)');

  const log = await getGitLog(dir);
  assert.equal(log.commits[0].isMerge, false);
  assert.deepEqual(log.commits[0].mergeInfo, {
    prNumber: 12,
    sourceBranch: null,
    title: 'Add the feature',
  });
});

test('getGitLog: respects limit and reports truncated', async () => {
  const dir = makeRepo();
  for (let i = 0; i < 5; i++) commit(dir, 'a.txt', String(i), `Commit ${i}`);

  const log = await getGitLog(dir, { limit: 3 });
  assert.equal(log.commits.length, 3);
  assert.equal(log.truncated, true);
  assert.equal(log.commits[0].subject, 'Commit 4');
});

test('detectMergeInfo: ignores a merge commit whose subject does not match the GitHub pattern', () => {
  const info = detectMergeInfo({
    parents: ['a', 'b'],
    subject: "Merge branch 'feature/thing' into main",
    body: '',
  });
  assert.equal(info, null);
});
