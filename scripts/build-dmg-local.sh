#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

APP="${1:-}"
if [ -z "$APP" ]; then
    for candidate in \
        "target/universal-apple-darwin/release/bundle/macos/Houston.app" \
        "target/aarch64-apple-darwin/release/bundle/macos/Houston.app" \
        "target/x86_64-apple-darwin/release/bundle/macos/Houston.app" \
        "target/release/bundle/macos/Houston.app"; do
        if [ -d "$candidate" ]; then
            APP="$candidate"
            break
        fi
    done
fi

if [ -z "$APP" ] || [ ! -d "$APP" ]; then
    echo "::error::No Houston.app found." >&2
    echo "Either:" >&2
    echo "  - run 'cd app && pnpm tauri build' once first, OR" >&2
    echo "  - pass the .app path: $0 path/to/Houston.app" >&2
    exit 1
fi

BG="app/src-tauri/assets/dmg-background.tiff"
if [ ! -f "$BG" ]; then
    echo "::error::Background image missing: $BG" >&2
    echo "Rebuild with: tiffutil -cathidpicheck app/src-tauri/assets/dmg-background.png app/src-tauri/assets/dmg-background@2x.png -out $BG" >&2
    exit 1
fi

WINDOW_W=608
WINDOW_H=480
APP_X=145
APP_Y=258
APPLICATIONS_X=465
APPLICATIONS_Y=258
ICON_SIZE=110
VOLUME_NAME="Houston Installer"

OUT_DIR="target/local-dmg"
OUT_DMG="$OUT_DIR/Houston-local.dmg"
mkdir -p "$OUT_DIR"
rm -f "$OUT_DMG"

WORK_DIR=$(mktemp -d)
STAGING="$WORK_DIR/staging"
SPARSE="$WORK_DIR/work.dmg"
MOUNT_POINT="/Volumes/$VOLUME_NAME"
mkdir -p "$STAGING"

cleanup() {
    hdiutil detach "$MOUNT_POINT" -force -quiet 2>/dev/null || true
    rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "=== Staging .app + background ==="
cp -R "$APP" "$STAGING/Houston.app"
mkdir -p "$STAGING/.background"
cp "$BG" "$STAGING/.background/background.tiff"
ln -s /Applications "$STAGING/Applications"

chflags hidden "$STAGING/.background"

APP_SIZE_KB=$(du -sk "$STAGING" | cut -f1)
SIZE_MB=$(( APP_SIZE_KB / 1024 + 80 ))

echo "=== Creating ${SIZE_MB} MB sparse image ==="
hdiutil create -srcfolder "$STAGING" -volname "$VOLUME_NAME" \
    -fs HFS+ -fsargs "-c c=64,a=16,e=16" \
    -format UDRW -size "${SIZE_MB}m" \
    "${SPARSE%.dmg}" -quiet

echo "=== Mounting sparse image ==="
hdiutil attach "$SPARSE" -noverify -quiet

if [ -d "$MOUNT_POINT/.fseventsd" ]; then
    chflags hidden "$MOUNT_POINT/.fseventsd"
fi
if [ -d "$MOUNT_POINT/.background" ]; then
    chflags hidden "$MOUNT_POINT/.background"
fi

echo "=== Applying Finder layout (window size, icon positions, background) ==="
osascript <<APPLESCRIPT
tell application "Finder"
    tell disk "$VOLUME_NAME"
        open
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set the bounds of container window to {100, 100, $((100 + WINDOW_W)), $((100 + WINDOW_H))}
        set viewOptions to the icon view options of container window
        set arrangement of viewOptions to not arranged
        set icon size of viewOptions to $ICON_SIZE
        set background picture of viewOptions to file ".background:background.tiff"
        set position of item "Houston.app" of container window to {$APP_X, $APP_Y}
        set position of item "Applications" of container window to {$APPLICATIONS_X, $APPLICATIONS_Y}
        -- Park the auto-created dot-folders far off-screen so they don't
        -- overlap the styled background for users who have hidden-files
        -- toggled on (Cmd+Shift+. in Finder).
        try
            set position of item ".background" of container window to {1500, 1500}
        end try
        try
            set position of item ".fseventsd" of container window to {1600, 1500}
        end try
        update without registering applications
        delay 1
        close
    end tell
end tell
APPLESCRIPT

sync
sleep 1

echo "=== Detaching ==="
hdiutil detach "$MOUNT_POINT" -quiet

echo "=== Converting to compressed read-only DMG ==="
hdiutil convert "$SPARSE" -format UDZO -imagekey zlib-level=9 \
    -o "${OUT_DMG%.dmg}" -quiet

ls -lh "$OUT_DMG"
echo ""
echo "=== Done ==="
echo "Open with: open '$OUT_DMG'"
echo ""
echo "After mounting, to test the first-launch guard:"
echo "  1. DON'T drag the app out — instead double-click Houston.app inside the mounted disk."
echo "  2. The 'Move Houston to your Applications folder' dialog should appear."
