/**
 * Startup check for the Electron shell: make sure the server answering on the
 * port is the one we just spawned. A stale server left on the port would serve
 * this build's app.html (read fresh from disk) with an older build's API.
 */

import http from 'http';

/** GET /api/health → { pid } (pid null for servers that predate it), or null when nothing answers. */
export function fetchHealth({ port, host = 'localhost' }) {
  return new Promise((resolve) => {
    http
      .get(`http://${host}:${port}/api/health`, (res) => {
        let body = '';
        res.on('data', (d) => { body += d; });
        res.on('end', () => {
          try {
            resolve(res.statusCode === 200 ? { pid: JSON.parse(body).pid ?? null } : null);
          } catch {
            resolve(null);
          }
        });
      })
      .on('error', () => resolve(null));
  });
}

export async function waitForServer(expectedPid, { port, retries = 30, intervalMs = 100, host } = {}) {
  for (let i = 0; i <= retries; i++) {
    const health = await fetchHealth({ port, host });
    if (health?.pid === expectedPid) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Server failed to start');
}

/** Message for a spawned server that exited before answering. */
export async function describeStartFailure(code, { port, host } = {}) {
  const health = await fetchHealth({ port, host });
  if (!health) {
    return `The Kando server exited (code ${code}) before it was ready. Run "npm run server" in the Kando folder to see why.`;
  }
  const stop = health.pid ? `kill ${health.pid}` : `lsof -ti :${port} | xargs kill`;
  return `Another Kando server is already running on port ${port}, probably left over from an earlier run or "npm run server". It may be an older version, so Kando won't use it.\n\nStop it (${stop}) and start Kando again.`;
}
