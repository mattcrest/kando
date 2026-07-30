#!/usr/bin/env bash
# Sync the portable Kando agent pack into an app repo (wrapper).
# Usage: ./scripts/install-app-repo-snippet.sh /path/to/app-repo [sync-agent-pack flags...]
set -euo pipefail

APP_REPO="${1:?app repo path required}"
shift || true
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "${ROOT}/scripts/sync-agent-pack.sh" --app-repo "${APP_REPO}" "$@"
