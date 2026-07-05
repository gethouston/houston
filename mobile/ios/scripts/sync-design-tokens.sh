#!/bin/sh
# Xcode pre-build phase (2): sync the generated SwiftUI design tokens into
# Houston/Generated/ so the DesignSystem sources compile against them.
#
# packages/design-tokens emits dist/swift/HoustonTokens.swift (gitignored). Its
# `prepare` script regenerates it on `pnpm install`; if it is missing we build
# it here so a fresh checkout still works. The file is copied (not symlinked) so
# Xcode's dependency analysis can track it as a source input.
#
# Incremental builds skip this whole phase via the input/output file lists in
# project.yml — it only runs when the token file changes.
set -eu

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
. "$SCRIPT_DIR/lib.sh"

REPO_ROOT=$(houston_repo_root "$0")
SRC="$REPO_ROOT/packages/design-tokens/dist/swift/HoustonTokens.swift"

if [ ! -f "$SRC" ]; then
  echo "[sync-design-tokens] token file missing; building @houston/design-tokens..."
  houston_repair_path
  houston_require_pnpm
  ( cd "$REPO_ROOT" && pnpm --filter @houston/design-tokens build )
fi

if [ ! -f "$SRC" ]; then
  echo "error: $SRC still missing after build. Run 'pnpm --filter @houston/design-tokens build'." >&2
  exit 1
fi

DEST_DIR="$SCRIPT_DIR/../Houston/Generated"
DEST="$DEST_DIR/HoustonTokens.swift"
mkdir -p "$DEST_DIR"
cp "$SRC" "$DEST"
echo "[sync-design-tokens] staged $DEST"
