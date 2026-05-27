#!/usr/bin/env bash
# Rename the mounted-volume label of a macOS DMG.
#
# Tauri's bundler hardcodes the DMG volume name to `productName` ("Houston"),
# which makes the mounted disk indistinguishable from the app itself in
# Finder and the macOS dock. We want the disk to read "Houston Installer"
# so non-technical users don't think the mounted volume IS the app.
#
# Approach: convert the read-only .dmg → temporary read/write .sparseimage,
# rename the volume with `hdiutil resize`'s sibling tool isn't reliable, so
# we instead mount, rename via `diskutil`, detach, then convert back to a
# compressed read-only UDZO image at the original path.
#
# Usage:
#   ./scripts/rename-dmg-volume.sh path/to/Houston_x.y.z_aarch64.dmg "Houston Installer"
#
# Notes:
#   - Preserves all existing DMG contents (including the styled background,
#     icon positions, Applications symlink, and .DS_Store layout that
#     tauri-bundler injected).
#   - Resulting DMG is unsigned (the rename invalidates the original
#     code-signature). On CI the existing `Notarize DMG` step re-notarizes
#     and staples after rename — that re-signs implicitly. For local runs
#     you can skip signing; Gatekeeper will warn on first open.

set -euo pipefail

if [ $# -ne 2 ]; then
    echo "usage: $0 <dmg-path> <new-volume-name>" >&2
    exit 1
fi

DMG="$1"
NEW_NAME="$2"

if [ ! -f "$DMG" ]; then
    echo "::error::DMG not found: $DMG" >&2
    exit 1
fi

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"; hdiutil detach "$MOUNT_POINT" -force -quiet 2>/dev/null || true' EXIT

SPARSE="$WORK_DIR/work.sparseimage"
MOUNT_POINT="$WORK_DIR/mnt"
mkdir -p "$MOUNT_POINT"

echo "=== Converting $(basename "$DMG") to writable sparse image ==="
hdiutil convert "$DMG" -format UDSP -o "${SPARSE%.sparseimage}" -quiet

echo "=== Mounting sparse image ==="
hdiutil attach "$SPARSE" -mountpoint "$MOUNT_POINT" -nobrowse -quiet

echo "=== Renaming volume to '$NEW_NAME' ==="
# `diskutil rename <mount-point>` works on the mounted HFS+/APFS volume.
diskutil rename "$MOUNT_POINT" "$NEW_NAME"

# Hide the dot-prefixed helper folders so users with "show hidden files"
# enabled in Finder (Cmd+Shift+.) don't see `.background` and
# `.fseventsd` overlapping the styled background art. The Tauri DMG
# bundler doesn't set the UF_HIDDEN flag by default; do it here while
# we've already got the volume mounted read-write.
NEW_MOUNT="/Volumes/$NEW_NAME"
for dotdir in .background .fseventsd; do
    if [ -d "$NEW_MOUNT/$dotdir" ]; then
        chflags hidden "$NEW_MOUNT/$dotdir" || true
    fi
done

echo "=== Detaching ==="
hdiutil detach "$NEW_MOUNT" -quiet

echo "=== Re-compressing back to read-only UDZO at original path ==="
TMP_OUT="$WORK_DIR/out.dmg"
hdiutil convert "$SPARSE" -format UDZO -imagekey zlib-level=9 -o "${TMP_OUT%.dmg}" -quiet
mv "$TMP_OUT" "$DMG"

echo "=== Done: $DMG (volume name: $NEW_NAME) ==="
