#!/usr/bin/env bash
# Cursor: symlink bundled skills into ~/.cursor/skills/
# Agent-agnostic spec: docs/agent-routing.md
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/install-skills-to.sh
source "${ROOT}/scripts/lib/install-skills-to.sh"

install_skills_to \
  "${ROOT}/.cursor/skills" \
  "${CURSOR_SKILLS_DIR:-${HOME}/.cursor/skills}" \
  "Cursor"

echo "Open a new Cursor chat so skill discovery picks them up."
