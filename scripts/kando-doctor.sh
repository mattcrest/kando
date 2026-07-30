#!/usr/bin/env bash
# Run Kando vault doctor against a vault (non-zero exit on contract errors).
set -euo pipefail

VAULT="${1:-}"
API_URL="${KANDO_API_URL:-http://127.0.0.1:3001}"

if [[ -z "${VAULT}" ]]; then
  echo "Usage: $0 <vault-key>" >&2
  echo "Example: $0 deepdrifts" >&2
  exit 2
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required" >&2
  exit 2
fi

RESP="$(curl -sf "${API_URL}/api/vaults/${VAULT}/doctor" || true)"
if [[ -z "${RESP}" ]]; then
  echo "Failed to reach Kando at ${API_URL}. Is the server running?" >&2
  exit 2
fi

python3 - <<'PY' "${RESP}"
import json, sys
report = json.loads(sys.argv[1])
summary = report.get("summary", {})
print(f"Vault: {report.get('vaultKey')} — {summary.get('errorCount', 0)} error(s), {summary.get('warningCount', 0)} warning(s)")
for err in report.get("errors", [])[:20]:
    cid = err.get("id", "?")
    print(f"  ERROR [{cid}] {err.get('message')}")
    if err.get("fix"):
        print(f"         fix: {err['fix']}")
if summary.get("errorCount", 0) > 20:
    print(f"  …and {summary['errorCount'] - 20} more errors")
if not report.get("ok", True):
    sys.exit(1)
PY
