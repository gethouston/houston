#!/usr/bin/env bash
# Prepare Windows MSI artifacts for TS-engine desktop workflow.
set -euo pipefail

TARGET="${1:?usage: prepare-ts-engine-windows-artifact.sh <target-triple> <artifact-suffix>}"
SUFFIX="${2:?usage: prepare-ts-engine-windows-artifact.sh <target-triple> <artifact-suffix>}"
BUNDLE="target/${TARGET}/release/bundle"
OUT="artifacts/windows-${SUFFIX}"

newest_match() {
  local dir="$1" pattern="$2" newest="" file
  while IFS= read -r file; do
    if [ -z "$newest" ] || [ "$file" -nt "$newest" ]; then
      newest="$file"
    fi
  done < <(compgen -G "$dir/$pattern" || true)
  printf '%s\n' "$newest"
}

MSI=$(newest_match "$BUNDLE/msi" "*.msi")
SIG=$(newest_match "$BUNDLE/msi" "*.msi.sig")

if [ ! -f "$MSI" ]; then
  echo "::error::Windows TS-engine MSI missing under $BUNDLE/msi"
  find "$BUNDLE" -maxdepth 4 -print 2>&1 | head -80 || true
  exit 1
fi

echo "Artifacts: msi=$MSI ($(du -sh "$MSI" | cut -f1))"
mkdir -p "$OUT"
cp "$MSI" "$OUT/"
# The updater signature only exists for updater-signed builds. Unsigned test
# builds disable createUpdaterArtifacts, so the .sig is absent — copy it only
# when present rather than failing the job.
if [ -n "$SIG" ] && [ -f "$SIG" ]; then
  echo "  updater sig: $SIG"
  cp "$SIG" "$OUT/"
fi
(cd "$OUT" && sha256sum ./* > checksums-sha256.txt)
ls -lh "$OUT"
