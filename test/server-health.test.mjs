import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { describeStartFailure, fetchHealth, waitForServer } from '../electron/server-health.js';

function serve(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const health = (body) => (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

describe('server-health', () => {
  const servers = [];
  after(() => servers.forEach((s) => s.close()));
  const host = '127.0.0.1';

  it('reads the pid, null for servers that predate it, and null when nothing answers', async () => {
    const a = await serve(health({ status: 'ok', pid: 42 }));
    const b = await serve(health({ status: 'ok' }));
    servers.push(a.server, b.server);
    assert.deepEqual(await fetchHealth({ port: a.port, host }), { pid: 42 });
    assert.deepEqual(await fetchHealth({ port: b.port, host }), { pid: null });
    b.server.close();
    assert.equal(await fetchHealth({ port: b.port, host }), null);
  });

  it('waits for our own pid and refuses a stale server on the port', async () => {
    const { server, port } = await serve(health({ status: 'ok', pid: 111 }));
    servers.push(server);
    await waitForServer(111, { port, host, retries: 2, intervalMs: 5 });
    await assert.rejects(waitForServer(222, { port, host, retries: 2, intervalMs: 5 }), /failed to start/);
  });

  it('names the stale server to stop, or falls back to lsof', async () => {
    const withPid = await serve(health({ status: 'ok', pid: 777 }));
    const withoutPid = await serve(health({ status: 'ok' }));
    servers.push(withPid.server, withoutPid.server);
    assert.match(await describeStartFailure(1, { port: withPid.port, host }), /Another Kando server[\s\S]*kill 777/);
    assert.match(await describeStartFailure(1, { port: withoutPid.port, host }), /lsof -ti :\d+ \| xargs kill/);
  });

  it('points at npm run server when nothing holds the port', async () => {
    const { server, port } = await serve(health({}));
    server.close();
    assert.match(await describeStartFailure(1, { port, host }), /exited \(code 1\)[\s\S]*npm run server/);
  });
});
