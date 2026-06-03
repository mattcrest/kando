#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KANDO_HOME="${KANDO_HOME:-${ROOT}}"
DEST="${COPILOT_INSTRUCTIONS:-${HOME}/.copilot/copilot-instructions.md}"

# shellcheck source=lib/append-marked-block.sh
source "${ROOT}/scripts/lib/append-marked-block.sh"

BODY="$(mktemp)"
trap 'rm -f "${BODY}"' EXIT
sed "s|KANDO_HOME|${KANDO_HOME}|g" "${ROOT}/scripts/lib/kando-routing-block.md" > "${BODY}"

append_marked_block "${DEST}" "kando-agent-routing" "${BODY}"
