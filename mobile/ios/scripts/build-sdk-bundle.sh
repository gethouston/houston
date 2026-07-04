#!/bin/sh
# Xcode pre-build phase (1): build the @houston/sdk native-bridge bundle and
# stage it into Houston/Generated/ so it is bundled as an app resource.
#
# The bundle (dist/houston-sdk.bridge.js) is a self-contained IIFE exposing the
# global `HoustonSdkBridge` that runs inside JavaScriptCore (see
# packages/sdk/BRIDGE.md). dist/ is gitignored, so we rebuild it here.
#
# Incremental builds skip this whole phase via the input/output file lists in
# project.yml — it only runs when the dist bundle is newer than the staged copy.
set -eu

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
. "$SCRIPT_DIR/lib.sh"
houston_repair_path
houston_require_pnpm

REPO_ROOT=$(houston_repo_root "$0")

echo "[build-sdk-bundle] building @houston/sdk bridge bundle..."
( cd "$REPO_ROOT" && pnpm --filter @houston/sdk build:bridge )

SRC="$REPO_ROOT/packages/sdk/dist/houston-sdk.bridge.js"
DEST_DIR="$SCRIPT_DIR/../Houston/Generated"
DEST="$DEST_DIR/houston-sdk.bridge.js"

if [ ! -f "$SRC" ]; then
  echo "error: expected bundle not found at $SRC after build:bridge." >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
cp "$SRC" "$DEST"
echo "[build-sdk-bundle] staged $DEST"
