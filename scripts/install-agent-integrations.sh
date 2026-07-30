#!/usr/bin/env bash
# Install Kando agent integrations for common tools.
#
# Usage:
#   ./scripts/install-agent-integrations.sh --all
#   ./scripts/install-agent-integrations.sh --cursor --codex --claude
#   ./scripts/install-agent-integrations.sh --cursor --app-repo /path/to/venubase-web
#
# Skills (Cursor / Codex / Claude Code): symlink .cursor/skills → tool skill dir
# Memory files (Claude / Copilot / Gemini): append marked block with link to docs/agent-routing.md
# App repos / vaults: portable agent pack via --app-repo / --vault (repeatable)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export KANDO_HOME="${KANDO_HOME:-${ROOT}}"

DO_CURSOR=0
DO_CODEX=0
DO_CLAUDE_SKILLS=0
DO_CLAUDE_MEMORY=0
DO_COPILOT=0
DO_GEMINI=0
APP_REPOS=()
VAULTS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      DO_CURSOR=1
      DO_CODEX=1
      DO_CLAUDE_SKILLS=1
      DO_CLAUDE_MEMORY=1
      DO_COPILOT=1
      DO_GEMINI=1
      ;;
    --cursor) DO_CURSOR=1 ;;
    --codex) DO_CODEX=1 ;;
    --claude) DO_CLAUDE_SKILLS=1; DO_CLAUDE_MEMORY=1 ;;
    --claude-skills) DO_CLAUDE_SKILLS=1 ;;
    --claude-memory) DO_CLAUDE_MEMORY=1 ;;
    --copilot) DO_COPILOT=1 ;;
    --gemini) DO_GEMINI=1 ;;
    --app-repo)
      shift
      APP_REPOS+=("${1:?--app-repo requires path}")
      ;;
    --vault)
      shift
      VAULTS+=("${1:?--vault requires path}")
      ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
  shift
done

if [[ "${DO_CURSOR}${DO_CODEX}${DO_CLAUDE_SKILLS}${DO_CLAUDE_MEMORY}${DO_COPILOT}${DO_GEMINI}" == "000000" && ${#APP_REPOS[@]} -eq 0 && ${#VAULTS[@]} -eq 0 ]]; then
  echo "No targets selected. Try: $0 --all" >&2
  exit 1
fi

run() {
  echo "==> $*"
  "$@"
  echo ""
}

[[ "${DO_CURSOR}" -eq 1 ]] && run "${ROOT}/scripts/install-cursor-skills.sh"
[[ "${DO_CODEX}" -eq 1 ]] && run "${ROOT}/scripts/install-codex-skills.sh"
[[ "${DO_CLAUDE_SKILLS}" -eq 1 ]] && run "${ROOT}/scripts/install-claude-skills.sh"
[[ "${DO_CLAUDE_MEMORY}" -eq 1 ]] && run "${ROOT}/scripts/install-claude-code-memory.sh"
[[ "${DO_COPILOT}" -eq 1 ]] && run "${ROOT}/scripts/install-copilot-instructions.sh"
[[ "${DO_GEMINI}" -eq 1 ]] && run "${ROOT}/scripts/install-gemini-memory.sh"

if [[ ${#APP_REPOS[@]} -gt 0 ]]; then
  for repo in "${APP_REPOS[@]}"; do
    run "${ROOT}/scripts/sync-agent-pack.sh" --app-repo "${repo}"
  done
fi

if [[ ${#VAULTS[@]} -gt 0 ]]; then
  for vault in "${VAULTS[@]}"; do
    run "${ROOT}/scripts/sync-agent-pack.sh" --vault "${vault}"
  done
fi

echo "Done. KANDO_HOME=${KANDO_HOME}"
echo "Canonical routing spec: ${KANDO_HOME}/docs/agent-routing.md"
