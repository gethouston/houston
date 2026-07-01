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

missing=()
[ -f "$MSI" ] || missing+=("MSI")
[ -f "$SIG" ] || missing+=("MSI .sig")
if [ ${#missing[@]} -gt 0 ]; then
  echo "::error::Windows TS-engine artifacts missing: ${missing[*]}"
  find "$BUNDLE" -maxdepth 4 -print 2>&1 | head -80 || true
  exit 1
fi

echo "Artifacts: msi=$MSI ($(du -sh "$MSI" | cut -f1)) sig=$SIG"
mkdir -p "$OUT"
cp "$MSI" "$OUT/"
cp "$SIG" "$OUT/"
(cd "$OUT" && sha256sum ./* > checksums-sha256.txt)
ls -lh "$OUT"
