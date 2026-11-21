#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BINARY="${1:-}"
if [ -z "$BINARY" ]; then
  BINARY="$(ls -1 "$REPO_ROOT"/target/host-sidecar/houston-host-* 2>/dev/null | grep -v '\.stamp$' | head -1 || true)"
fi
if [ -z "$BINARY" ] || [ ! -f "$BINARY" ]; then
  echo "ERROR: no compiled sidecar; run scripts/build-host-sidecar.sh first" >&2
  exit 1
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/houston-sidecar-browser.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
COPY="$WORK/$(basename "$BINARY")"
cp "$BINARY" "$COPY"
chmod +x "$COPY"

echo "=== Browser probe through $COPY ==="
OUT="$(cd "$WORK" && HOUSTON_SIDECAR_ROLE=browser-probe "$COPY" 2>&1)" || {
  echo "$OUT" >&2
  echo "ERROR: the compiled sidecar could not start a browser" >&2
  exit 1
}
echo "$OUT"
case "$OUT" in
  *"HOUSTON_BROWSER_PROBE ok fence=refused"*) echo "VERIFIED: the compiled sidecar starts a fenced browser" ;;
  *) echo "ERROR: the probe did not report success" >&2; exit 1 ;;
esac
