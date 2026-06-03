#!/usr/bin/env bash
# Append a short Kando pointer to an app repo's AGENTS.md.
# Usage: ./scripts/install-app-repo-snippet.sh /path/to/app-repo
set -euo pipefail

APP_REPO="${1:?app repo path required}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KANDO_HOME="${KANDO_HOME:-${ROOT}}"
DEST="${APP_REPO}/AGENTS.md"
APP_REPO="$(cd "${APP_REPO}" && pwd)"

# shellcheck source=lib/append-marked-block.sh
source "${ROOT}/scripts/lib/append-marked-block.sh"

BODY="$(mktemp)"
trap 'rm -f "${BODY}"' EXIT
cat > "${BODY}" <<EOF
## Roadmap cards (Kando)

Resolve this repo's roadmap vault before editing \`release-*.md\`:

- Spec: \`${KANDO_HOME}/docs/agent-routing.md\`
- API: \`curl -s "http://127.0.0.1:3001/api/routing/resolve?workspaceRoot=${APP_REPO}"\`
EOF

append_marked_block "${DEST}" "kando-agent-routing" "${BODY}"
