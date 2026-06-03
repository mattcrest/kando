#!/usr/bin/env bash
# OpenAI Codex CLI: symlink bundled skills into ~/.codex/skills/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/install-skills-to.sh
source "${ROOT}/scripts/lib/install-skills-to.sh"

install_skills_to \
  "${ROOT}/.cursor/skills" \
  "${CODEX_SKILLS_DIR:-${HOME}/.codex/skills}" \
  "Codex"

echo "Restart Codex or start a new session so skills reload."
