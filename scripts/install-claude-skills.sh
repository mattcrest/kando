#!/usr/bin/env bash
# Claude Code: symlink bundled skills into ~/.claude/skills/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/install-skills-to.sh
source "${ROOT}/scripts/lib/install-skills-to.sh"

DEST="${CLAUDE_SKILLS_DIR:-${HOME}/.claude/skills}"
install_skills_to "${ROOT}/.cursor/skills" "${DEST}" "Claude Code"

echo "Claude Code discovers skills from ${DEST} (and project .claude/skills/ when present)."
