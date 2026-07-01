#!/usr/bin/env bash
# Prepare signed/unsigned macOS artifacts for TS-engine desktop workflow.
set -euo pipefail

BUNDLE="${1:-target/universal-apple-darwin/release/bundle}"
OUT="${2:-artifacts/macos-universal}"
SIGN_MACOS="${SIGN_MACOS:-false}"

first_match() {
  local dir="$1" pattern="$2"
  compgen -G "$dir/$pattern" | sort | head -1 || true
}

newest_match() {
  local dir="$1" pattern="$2" newest="" file
  while IFS= read -r file; do
    if [ -z "$newest" ] || [ "$file" -nt "$newest" ]; then
      newest="$file"
    fi
  done < <(compgen -G "$dir/$pattern" || true)
  printf '%s\n' "$newest"
}

APP=$(first_match "$BUNDLE/macos" "*.app")
DMG=$(newest_match "$BUNDLE/dmg" "*.dmg")
TAR=$(newest_match "$BUNDLE/macos" "*.app.tar.gz")
SIG=$(newest_match "$BUNDLE/macos" "*.app.tar.gz.sig")

missing=()
[ -e "$APP" ] || missing+=(".app")
[ -f "$DMG" ] || missing+=(".dmg")
if [ ${#missing[@]} -gt 0 ]; then
  echo "::error::Missing TS-engine macOS build artifacts: ${missing[*]}"
  ls -laR "$BUNDLE" || true
  exit 1
fi

echo "Artifacts: app=$APP dmg=$DMG tar=$TAR sig=$SIG"

if [ "$SIGN_MACOS" = "true" ]; then
  signed_missing=()
  [ -f "$TAR" ] || signed_missing+=(".app.tar.gz")
  [ -f "$SIG" ] || signed_missing+=(".app.tar.gz.sig")
  if [ ${#signed_missing[@]} -gt 0 ]; then
    echo "::error::Signed macOS TS-engine artifacts missing: ${signed_missing[*]}"
    exit 1
  fi

  : "${APPLE_SIGNING_IDENTITY:?APPLE_SIGNING_IDENTITY is required when SIGN_MACOS=true}"
  : "${APPLE_API_KEY:?APPLE_API_KEY is required when SIGN_MACOS=true}"
  : "${APPLE_API_ISSUER:?APPLE_API_ISSUER is required when SIGN_MACOS=true}"
  KEY="${APPLE_API_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${APPLE_API_KEY}.p8}"
  if [[ "$KEY" == ~/* ]]; then
    KEY="$HOME/${KEY#~/}"
  fi
  [ -f "$KEY" ] || { echo "::error::Apple API key missing at $KEY"; exit 1; }

  SIDECAR=$(find "$APP/Contents" -type f -name 'houston-engine*' ! -name '*.dSYM*' | head -1)
  if [ -z "$SIDECAR" ] || [ ! -x "$SIDECAR" ]; then
    echo "::error::host sidecar missing or not executable inside .app"
    find "$APP/Contents" -type f | head -50
    exit 1
  fi

  echo "=== Verify universal host sidecar ==="
  LIPO=$(lipo -info "$SIDECAR" 2>&1 || true)
  echo "$LIPO"
  echo "$LIPO" | grep -q 'arm64' || { echo "::error::host sidecar missing arm64 slice"; exit 1; }
  echo "$LIPO" | grep -q 'x86_64' || { echo "::error::host sidecar missing x86_64 slice"; exit 1; }

  echo "=== Verify sidecar signing ==="
  codesign -vvv "$SIDECAR"
  AUTH=$(codesign -dvv "$SIDECAR" 2>&1 | grep '^Authority=' | head -1)
  echo "$AUTH"
  echo "$AUTH" | grep -q 'Developer ID Application' \
    || { echo "::error::host sidecar not signed with Developer ID"; exit 1; }
  FLAGS=$(codesign -dv "$SIDECAR" 2>&1 | grep -E '^CodeDirectory.*flags=' | head -1)
  echo "$FLAGS"
  echo "$FLAGS" | grep -q 'runtime' \
    || { echo "::error::host sidecar missing hardened runtime flag"; exit 1; }

  echo "=== Verify .app signing + notarization ==="
  codesign -vvv --deep --strict "$APP"
  xcrun stapler validate "$APP"

  echo "=== Rename, re-sign, notarize DMG ==="
  ./scripts/rename-dmg-volume.sh "$DMG" "Houston Installer"
  codesign --force --timestamp --sign "$APPLE_SIGNING_IDENTITY" "$DMG"
  codesign -vvv "$DMG"
  for attempt in 1 2 3; do
    echo "=== DMG notarization attempt $attempt/3 ==="
    if xcrun notarytool submit "$DMG" \
        --key-id "$APPLE_API_KEY" \
        --key "$KEY" \
        --issuer "$APPLE_API_ISSUER" \
        --wait; then
      xcrun stapler staple "$DMG"
      break
    fi
    [ "$attempt" -lt 3 ] || { echo "::error::DMG notarization failed"; exit 1; }
    sleep 30
  done

  echo "=== Verify complete DMG chain ==="
  codesign -vvv "$DMG"
  xcrun stapler validate "$DMG"
  MOUNT=$(mktemp -d)
  DMG_MOUNTED=0
  cleanup_mount() {
    if [ "$DMG_MOUNTED" = "1" ]; then
      hdiutil detach "$MOUNT" -quiet || true
    fi
  }
  trap cleanup_mount EXIT
  hdiutil attach "$DMG" -mountpoint "$MOUNT" -nobrowse -quiet
  DMG_MOUNTED=1
  INNER_APP=$(first_match "$MOUNT" "*.app")
  if [ -z "$INNER_APP" ]; then
    echo "::error::No .app found inside DMG"
    exit 1
  fi
  codesign -vvv --deep --strict "$INNER_APP"
  xcrun stapler validate "$INNER_APP"
  hdiutil detach "$MOUNT" -quiet
  DMG_MOUNTED=0
  trap - EXIT
fi

mkdir -p "$OUT"
for file in "$DMG" "$TAR" "$SIG"; do
  if [ -n "$file" ] && [ -f "$file" ]; then
    cp "$file" "$OUT/"
  fi
done
(cd "$OUT" && shasum -a 256 ./* > checksums-sha256.txt)
ls -lh "$OUT"
