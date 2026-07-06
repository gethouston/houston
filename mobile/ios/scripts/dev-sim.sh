#!/usr/bin/env bash
set -euo pipefail

# One-command iOS dev loop: build the app and run it in the iOS Simulator.
#   pnpm ios            (from the repo root)
# Regenerates the Xcode project, builds Debug for the simulator (the pre-build
# phases bundle the SDK + sync design tokens), boots a simulator if none is
# booted, installs, launches, and brings the Simulator window to front.

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

# Xcode may be installed while xcode-select still points at CommandLineTools
# (switching needs sudo). DEVELOPER_DIR is the no-sudo equivalent.
if ! xcodebuild -version >/dev/null 2>&1; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi
xcodebuild -version >/dev/null 2>&1 || {
  echo "error: Xcode not found (install it from the App Store)" >&2; exit 1; }
command -v xcodegen >/dev/null 2>&1 || {
  echo "error: xcodegen not found (brew install xcodegen)" >&2; exit 1; }

echo "▸ xcodegen"
xcodegen generate --quiet

echo "▸ building (Debug, iOS Simulator)"
xcodebuild -project Houston.xcodeproj -scheme Houston \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build/DerivedData -quiet build

APP="build/DerivedData/Build/Products/Debug-iphonesimulator/Houston.app"
test -d "$APP" || { echo "error: built app not found at $APP" >&2; exit 1; }

# Reuse the booted simulator, else boot the first available iPhone.
DEV="$(xcrun simctl list devices booted | grep -m1 -oE '[A-F0-9-]{36}' || true)"
if [ -z "$DEV" ]; then
  DEV="$(xcrun simctl list devices available | grep -m1 -E 'iPhone' | grep -oE '[A-F0-9-]{36}')"
  [ -n "$DEV" ] || { echo "error: no iPhone simulator available (Xcode > Settings > Components)" >&2; exit 1; }
  echo "▸ booting simulator $DEV"
  xcrun simctl boot "$DEV"
  xcrun simctl bootstatus "$DEV" >/dev/null
fi

echo "▸ installing + launching"
xcrun simctl install "$DEV" "$APP"
xcrun simctl terminate "$DEV" com.gethouston.Houston >/dev/null 2>&1 || true
xcrun simctl launch "$DEV" com.gethouston.Houston >/dev/null
open -a Simulator
echo "✓ Houston is running in the Simulator"
