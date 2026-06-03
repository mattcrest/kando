import path from 'path';

const DEFAULT_CONVENTIONS_FILE = 'roadmap-conventions.md';
const DEFAULT_INDEX_FILE = 'roadmap-index.md';

/**
 * Convert a glob-style path pattern (* segments) to a RegExp anchored to full path.
 */
export function globPatternToRegExp(pattern) {
  const normalized = pattern.replace(/\\/g, '/');
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/**
 * @param {string} workspacePath - absolute or resolvable path (file or dir)
 * @param {string} pattern - exact path or glob pattern
 */
export function workspaceMatchesPattern(workspacePath, pattern) {
  const resolved = path.resolve(workspacePath);
  if (pattern.includes('*')) {
    const re = globPatternToRegExp(path.resolve(pattern));
    return re.test(resolved);
  }
  const patternResolved = path.resolve(pattern);
  return (
    resolved === patternResolved ||
    resolved.startsWith(patternResolved + path.sep)
  );
}

/**
 * @param {string} workspaceRoot
 * @param {Record<string, object>} routingByVault
 * @param {Record<string, string>} vaultPaths - vault key -> vault dir
 * @returns {{ vaultKey: string, vaultPath: string, routing: object } | null}
 */
export function resolveVaultForWorkspace(workspaceRoot, routingByVault, vaultPaths) {
  if (!workspaceRoot || !routingByVault) return null;

  for (const [vaultKey, routing] of Object.entries(routingByVault)) {
    const roots = routing?.workspaceRoots;
    if (!Array.isArray(roots) || !vaultPaths[vaultKey]) continue;

    for (const pattern of roots) {
      if (workspaceMatchesPattern(workspaceRoot, pattern)) {
        return {
          vaultKey,
          vaultPath: vaultPaths[vaultKey],
          routing: normalizeRoutingEntry(routing),
        };
      }
    }
  }
  return null;
}

export function normalizeRoutingEntry(entry = {}) {
  return {
    workspaceRoots: entry.workspaceRoots || [],
    conventionsFile: entry.conventionsFile || DEFAULT_CONVENTIONS_FILE,
    indexFile: entry.indexFile || DEFAULT_INDEX_FILE,
    canonicalRepo: entry.canonicalRepo || null,
  };
}

export function getRoutingForVault(vaultKey, routingByVault) {
  if (!routingByVault?.[vaultKey]) return null;
  return normalizeRoutingEntry(routingByVault[vaultKey]);
}
