#!/usr/bin/env bash

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
DEV_NODE=""
mkdir -p "$MOUNT_POINT"

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
ATTACH_OUT=$(hdiutil attach "$SPARSE" -mountpoint "$MOUNT_POINT" -nobrowse)
DEV_NODE=$(printf '%s\n' "$ATTACH_OUT" | awk '/^\/dev\// { print $1; exit }')
if [ -z "$DEV_NODE" ]; then
    echo "::error::could not determine device node from hdiutil attach" >&2
    printf '%s\n' "$ATTACH_OUT" >&2
    exit 1
fi
echo "mounted $DEV_NODE at $MOUNT_POINT"

for dotdir in .background .fseventsd; do
    if [ -d "$MOUNT_POINT/$dotdir" ]; then
        chflags hidden "$MOUNT_POINT/$dotdir" || true
    fi
done

echo "=== Renaming volume to '$NEW_NAME' ==="
diskutil rename "$MOUNT_POINT" "$NEW_NAME"

echo "=== Detaching ==="
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
DEV_NODE=""

echo "=== Re-compressing back to read-only UDZO at original path ==="
TMP_OUT="$WORK_DIR/out.dmg"
hdiutil convert "$SPARSE" -format UDZO -imagekey zlib-level=9 -o "${TMP_OUT%.dmg}" -quiet
mv "$TMP_OUT" "$DMG"

echo "=== Done: $DMG (volume name: $NEW_NAME) ==="
