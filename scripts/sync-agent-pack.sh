#!/usr/bin/env bash
# Sync the portable Kando agent pack into app repos and/or roadmap vaults.
#
# Usage:
#   ./scripts/sync-agent-pack.sh --app-repo /path/to/app
#   ./scripts/sync-agent-pack.sh --vault /path/to/roadmap-vault
#   ./scripts/sync-agent-pack.sh --app-repo /path/to/app --vault-key venubase \
#       --vault-hint docs/roadmap --vault-hint ../venubase-roadmap \
#       --canonical-repo mattcrest/venubase-roadmap
#
# Regenerates card-contract.json from electron/card-contract.js before sync.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACK="${ROOT}/templates/agent-pack"
MARKER_ID="kando-agent-routing"

APP_REPOS=()
VAULTS=()
VAULT_KEY=""
VAULT_HINTS=()
CANONICAL_REPO=""
CONVENTIONS_FILE="roadmap-conventions.md"
INDEX_FILE="roadmap-index.md"
SKIP_GENERATE=0
SKIP_SKILLS=0

usage() {
  sed -n '2,25p' "$0"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-repo)
      shift
      APP_REPOS+=("${1:?--app-repo requires path}")
      ;;
    --vault)
      shift
      VAULTS+=("${1:?--vault requires path}")
      ;;
    --vault-key) shift; VAULT_KEY="${1:?}" ;;
    --vault-hint) shift; VAULT_HINTS+=("${1:?}") ;;
    --canonical-repo) shift; CANONICAL_REPO="${1:?}" ;;
    --conventions-file) shift; CONVENTIONS_FILE="${1:?}" ;;
    --index-file) shift; INDEX_FILE="${1:?}" ;;
    --skip-generate) SKIP_GENERATE=1 ;;
    --skip-skills) SKIP_SKILLS=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [[ ${#APP_REPOS[@]} -eq 0 && ${#VAULTS[@]} -eq 0 ]]; then
  echo "Specify --app-repo and/or --vault." >&2
  usage >&2
  exit 1
fi

# shellcheck source=lib/append-marked-block.sh
source "${ROOT}/scripts/lib/append-marked-block.sh"

sync_kando_dir() {
  local DEST_ROOT="$1"
  local KANDO_DIR="${DEST_ROOT}/.kando"

  mkdir -p "${KANDO_DIR}/templates"
  cp "${PACK}/docs/kando-for-agents.md" "${KANDO_DIR}/kando-for-agents.md"
  cp "${PACK}/card-contract.json" "${KANDO_DIR}/card-contract.json"
  cp "${PACK}/templates/"*.md "${KANDO_DIR}/templates/"
  echo "Synced .kando/ → ${KANDO_DIR}"
}

sync_skills() {
  local DEST_ROOT="$1"
  local skill

  for skill in kando-roadmap-router release-card-writing kando-strategy-setup; do
    if [[ -d "${PACK}/skills/${skill}" ]]; then
      mkdir -p "${DEST_ROOT}/.cursor/skills/${skill}"
      mkdir -p "${DEST_ROOT}/.claude/skills/${skill}"
      cp "${PACK}/skills/${skill}/SKILL.md" "${DEST_ROOT}/.cursor/skills/${skill}/SKILL.md"
      cp "${PACK}/skills/${skill}/SKILL.md" "${DEST_ROOT}/.claude/skills/${skill}/SKILL.md"
    fi
  done
  echo "Synced skills → ${DEST_ROOT}/.cursor/skills/ and .claude/skills/"
}

write_agent_json() {
  local DEST_ROOT="$1"
  local OUT="${DEST_ROOT}/kando.agent.json"

  if [[ -f "${OUT}" && ${#VAULT_HINTS[@]} -eq 0 && -z "${VAULT_KEY}" && -z "${CANONICAL_REPO}" ]]; then
    echo "Keeping existing kando.agent.json at ${OUT}"
    return
  fi

  if [[ ! -f "${OUT}" ]]; then
    if [[ -z "${VAULT_KEY}" ]]; then
      echo "No kando.agent.json at ${OUT} — copy from templates/agent-pack/kando.agent.json.example and edit vaultPathHints." >&2
      cp "${PACK}/kando.agent.json.example" "${OUT}"
      echo "Created ${OUT} from example (edit vaultPathHints)."
      return
    fi
  fi

  # Merge: preserve existing hints if none passed on CLI.
  python3 - "${OUT}" "${VAULT_KEY}" "${CANONICAL_REPO}" "${CONVENTIONS_FILE}" "${INDEX_FILE}" "${VAULT_HINTS[@]:-}" <<'PY'
import json, sys
from pathlib import Path

out = Path(sys.argv[1])
vault_key = sys.argv[2]
canonical = sys.argv[3]
conventions = sys.argv[4]
index_file = sys.argv[5]
cli_hints = [h for h in sys.argv[6:] if h]

data = {}
if out.exists():
    data = json.loads(out.read_text())

if vault_key:
    data["vaultKey"] = vault_key
if canonical:
    data["canonicalRepo"] = canonical
data.setdefault("conventionsFile", conventions)
data.setdefault("indexFile", index_file)
if cli_hints:
    data["vaultPathHints"] = cli_hints
elif "vaultPathHints" not in data:
    data["vaultPathHints"] = ["docs/roadmap"]

out.write_text(json.dumps(data, indent=2) + "\n")
print(f"Wrote {out}")
PY
}

append_entry_docs() {
  local DEST_ROOT="$1"
  local BODY
  BODY="$(mktemp)"
  trap 'rm -f "${BODY}"' RETURN
  cp "${ROOT}/templates/agents/kando-agents-pack-snippet.md" "${BODY}"

  for dest in "${DEST_ROOT}/AGENTS.md" "${DEST_ROOT}/CLAUDE.md"; do
    append_marked_block "${dest}" "${MARKER_ID}" "${BODY}"
  done
}

echo "==> Regenerating agent pack contract"
if [[ "${SKIP_GENERATE}" -eq 0 ]]; then
  node "${ROOT}/scripts/generate-agent-pack-contract.mjs"
else
  echo "(skipped)"
fi
echo ""

if [[ ${#APP_REPOS[@]} -gt 0 ]]; then
  for repo in "${APP_REPOS[@]}"; do
    repo="$(cd "${repo}" && pwd)"
    echo "==> App repo: ${repo}"
    sync_kando_dir "${repo}"
    if [[ "${SKIP_SKILLS}" -eq 0 ]]; then
      sync_skills "${repo}"
    fi
    write_agent_json "${repo}"
    append_entry_docs "${repo}"
    echo ""
  done
fi

if [[ ${#VAULTS[@]} -gt 0 ]]; then
  for vault in "${VAULTS[@]}"; do
    vault="$(cd "${vault}" && pwd)"
    echo "==> Vault: ${vault}"
    sync_kando_dir "${vault}"
    if [[ "${SKIP_SKILLS}" -eq 0 ]]; then
      sync_skills "${vault}"
    fi
    echo ""
  done
fi

echo "Done. Pack source: ${PACK}"
