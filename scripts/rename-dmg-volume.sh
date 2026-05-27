#!/usr/bin/env bash
# Rename the mounted-volume label of a macOS DMG.
#
# Tauri's bundler hardcodes the DMG volume name to `productName` ("Houston"),
# which makes the mounted disk indistinguishable from the app itself in
# Finder and the macOS dock. We want the disk to read "Houston Installer"
# so non-technical users don't think the mounted volume IS the app.
#
# Approach: convert the read-only .dmg into a temporary read/write
# .sparseimage, mount it, rename the volume via `diskutil`, detach, then
# convert back to a compressed read-only UDZO image at the original path.
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
#     and staples after rename, which re-signs implicitly. For local runs
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
SPARSE="$WORK_DIR/work.sparseimage"
MOUNT_POINT="$WORK_DIR/mnt"
# Device node (e.g. /dev/disk6) from `hdiutil attach`, captured after mount.
# We detach by device, NOT by mountpoint: renaming a mounted volume can make
# macOS expose it at /Volumes/<new-name> while the original -mountpoint goes
# stale, so the device node is the only handle that stays valid across the
# rename. Empty until attached so the EXIT trap can guard on it.
DEV_NODE=""
mkdir -p "$MOUNT_POINT"

# Detach (by device) BEFORE removing the temp dir. Reversing that order is
# what produced the "Resource busy" / "Directory not empty" rm failures: the
# volume was still mounted under $WORK_DIR when rm ran.
cleanup() {
    if [ -n "$DEV_NODE" ]; then
        hdiutil detach "$DEV_NODE" -force -quiet 2>/dev/null || true
    fi
    rm -rf "$WORK_DIR" 2>/dev/null || true
}
trap cleanup EXIT

echo "=== Converting $(basename "$DMG") to writable sparse image ==="
hdiutil convert "$DMG" -format UDSP -o "${SPARSE%.sparseimage}" -quiet

echo "=== Mounting sparse image ==="
# Not -quiet: we need the attach table to extract the device node.
ATTACH_OUT=$(hdiutil attach "$SPARSE" -mountpoint "$MOUNT_POINT" -nobrowse)
DEV_NODE=$(printf '%s\n' "$ATTACH_OUT" | awk '/^\/dev\// { print $1; exit }')
if [ -z "$DEV_NODE" ]; then
    echo "::error::could not determine device node from hdiutil attach" >&2
    printf '%s\n' "$ATTACH_OUT" >&2
    exit 1
fi
echo "mounted $DEV_NODE at $MOUNT_POINT"

# Hide the dot-prefixed helper folders so users with "show hidden files"
# enabled in Finder (Cmd+Shift+.) don't see `.background` and `.fseventsd`
# overlapping the styled background art. Done BEFORE the rename, while the
# volume is unambiguously at $MOUNT_POINT.
for dotdir in .background .fseventsd; do
    if [ -d "$MOUNT_POINT/$dotdir" ]; then
        chflags hidden "$MOUNT_POINT/$dotdir" || true
    fi
done

echo "=== Renaming volume to '$NEW_NAME' ==="
# `diskutil rename <mount-point>` works on the mounted HFS+/APFS volume.
diskutil rename "$MOUNT_POINT" "$NEW_NAME"

echo "=== Detaching ==="
# A freshly renamed volume can briefly report busy (fseventsd, Spotlight
# indexing), so retry the detach before giving up.
detached=0
for attempt in 1 2 3 4 5; do
    if hdiutil detach "$DEV_NODE" -force -quiet 2>/dev/null; then
        detached=1
        break
    fi
    echo "detach attempt $attempt: $DEV_NODE busy, retrying in 2s..."
    sleep 2
done
if [ "$detached" -ne 1 ]; then
    echo "::error::failed to detach $DEV_NODE after 5 attempts" >&2
    exit 1
fi
DEV_NODE=""  # detached cleanly; stop the EXIT trap from re-detaching

echo "=== Re-compressing back to read-only UDZO at original path ==="
TMP_OUT="$WORK_DIR/out.dmg"
hdiutil convert "$SPARSE" -format UDZO -imagekey zlib-level=9 -o "${TMP_OUT%.dmg}" -quiet
mv "$TMP_OUT" "$DMG"

echo "=== Done: $DMG (volume name: $NEW_NAME) ==="
