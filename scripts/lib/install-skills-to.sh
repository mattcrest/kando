#!/usr/bin/env bash
# Symlink skill directories (each containing SKILL.md) from SRC into DEST.
# Source this file and call: install_skills_to <src_dir> <dest_dir> <tool_label>

install_skills_to() {
  local SRC="${1:?src_dir required}"
  local DEST="${2:?dest_dir required}"
  local LABEL="${3:-agent}"

  if [[ ! -d "${SRC}" ]]; then
    echo "No skills found at ${SRC}" >&2
    return 1
  fi

  mkdir -p "${DEST}"

  local installed=0
  local skipped=0
  local skill_dir name target
  for skill_dir in "${SRC}"/*/; do
    [[ -d "${skill_dir}" ]] || continue
    name="$(basename "${skill_dir}")"
    if [[ ! -f "${skill_dir}/SKILL.md" ]]; then
      echo "skip ${name}: missing SKILL.md" >&2
      skipped=$((skipped + 1))
      continue
    fi
    target="${DEST}/${name}"
    ln -sfn "$(cd "${skill_dir}" && pwd)" "${target}"
    echo "linked ${target}"
    installed=$((installed + 1))
  done

  echo ""
  echo "${LABEL}: installed ${installed} skill(s) into ${DEST}"
  if [[ "${skipped}" -gt 0 ]]; then
    echo "${LABEL}: skipped ${skipped} (no SKILL.md)"
  fi
}
