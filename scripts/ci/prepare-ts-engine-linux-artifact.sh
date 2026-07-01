#!/usr/bin/env bash
# Prepare Linux AppImage/deb artifacts for TS-engine desktop workflow.
set -euo pipefail

TARGET="${1:-x86_64-unknown-linux-gnu}"
SUFFIX="${2:-x64}"
BUNDLE="target/${TARGET}/release/bundle"
OUT="artifacts/linux-${SUFFIX}"

newest_match() {
  local dir="$1" pattern="$2" newest="" file
  while IFS= read -r file; do
    if [ -z "$newest" ] || [ "$file" -nt "$newest" ]; then
      newest="$file"
    fi
  done < <(compgen -G "$dir/$pattern" || true)
  printf '%s\n' "$newest"
}

APPIMAGE=$(newest_match "$BUNDLE/appimage" "*.AppImage")
DEB=$(newest_match "$BUNDLE/deb" "*.deb")

missing=()
[ -f "$APPIMAGE" ] || missing+=("AppImage")
[ -f "$DEB" ] || missing+=(".deb")
if [ ${#missing[@]} -gt 0 ]; then
  echo "::error::Linux TS-engine artifacts missing: ${missing[*]}"
  find "$BUNDLE" -maxdepth 4 -print 2>&1 | head -80 || true
  exit 1
fi

echo "Artifacts: appimage=$APPIMAGE ($(du -sh "$APPIMAGE" | cut -f1)) deb=$DEB ($(du -sh "$DEB" | cut -f1))"
mkdir -p "$OUT"
cp "$APPIMAGE" "$OUT/"
cp "$DEB" "$OUT/"
(cd "$OUT" && sha256sum ./* > checksums-sha256.txt)
ls -lh "$OUT"
