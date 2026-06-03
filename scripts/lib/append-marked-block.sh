#!/usr/bin/env bash
# Append or replace a marked block in a markdown file.
# Usage: append_marked_block <dest_file> <marker_id> <body_file>
append_marked_block() {
  local DEST="${1:?dest}"
  local MARKER_ID="${2:?marker id}"
  local BODY_FILE="${3:?body file}"
  local START="<!-- ${MARKER_ID}:start -->"
  local END="<!-- ${MARKER_ID}:end -->"

  mkdir -p "$(dirname "${DEST}")"
  python3 - "${DEST}" "${START}" "${END}" "${BODY_FILE}" <<'PY'
import sys
from pathlib import Path

dest, start, end, body_path = sys.argv[1:5]
block = Path(body_path).read_text()
if not block.endswith("\n"):
    block += "\n"
wrapped = f"{start}\n{block}{end}\n"

path = Path(dest)
if path.exists():
    text = path.read_text()
    if start in text and end in text:
        pre = text.split(start)[0]
        post = text.split(end, 1)[1]
        path.write_text(pre + wrapped + post)
        print(f"Updated block in {path}")
    else:
        path.write_text(text.rstrip() + "\n\n" + wrapped)
    print(f"Appended block to {path}")
else:
    path.write_text(wrapped)
    print(f"Created {path}")
PY
}
