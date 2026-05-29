#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_ROOT="${HOUSTON_FLATPAK_WORK_ROOT:-$ROOT/.flatpak}"
STAGE="$WORK_ROOT/stage/app"
BUILD_DIR="$WORK_ROOT/build"
REPO_DIR="$WORK_ROOT/repo"
HOST_ARCH="$(uname -m)"
case "$HOST_ARCH" in
  x86_64)
    FLATPAK_ARCH="x86_64"
    ;;
  aarch64|arm64)
    FLATPAK_ARCH="aarch64"
    ;;
  *)
    echo "ERROR: unsupported Linux architecture for Flatpak packaging: $HOST_ARCH" >&2
    exit 1
    ;;
esac
BUNDLE_PATH="${HOUSTON_FLATPAK_BUNDLE_PATH:-$WORK_ROOT/Houston-linux-$FLATPAK_ARCH.flatpak}"
APP_BIN="$ROOT/target/release/houston-app"
ENGINE_BIN="$ROOT/target/release/houston-engine"
ICON_SRC="$ROOT/app/src-tauri/icons/128x128@2x.png"
RESOURCE_BIN_SRC="$ROOT/app/src-tauri/resources/bin"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: missing required command: $1" >&2
    exit 1
  }
}

need pnpm
need cargo
need flatpak-builder
need flatpak

if [ "$(uname -s)" != "Linux" ]; then
  echo "ERROR: Flatpak packaging must run on a Linux host" >&2
  exit 1
fi

cd "$ROOT"

printf '==> Host arch %s (Flatpak %s)\n' "$HOST_ARCH" "$FLATPAK_ARCH"

rm -rf "$WORK_ROOT"
mkdir -p \
  "$STAGE/bin/resources/bin" \
  "$STAGE/share/applications" \
  "$STAGE/share/icons/hicolor/256x256/apps" \
  "$STAGE/share/metainfo" \
  "$STAGE/share/houston"

printf '==> Build web assets\n'
pnpm --dir app build

printf '==> Build engine sidecar\n'
cargo build --release -p houston-engine-server

printf '==> Build Tauri app binary\n'
cargo build --manifest-path app/src-tauri/Cargo.toml --release

[ -x "$APP_BIN" ] || {
  echo "ERROR: app binary missing at $APP_BIN" >&2
  exit 1
}
[ -x "$ENGINE_BIN" ] || {
  echo "ERROR: engine binary missing at $ENGINE_BIN" >&2
  exit 1
}

install -m 0755 "$APP_BIN" "$STAGE/bin/houston-app"
install -m 0755 "$ENGINE_BIN" "$STAGE/bin/houston-engine"
install -m 0755 "$ROOT/flatpak/houston" "$STAGE/bin/houston"
install -m 0644 "$ROOT/flatpak/com.houston.app.desktop" "$STAGE/share/applications/com.houston.app.desktop"
install -m 0644 "$ROOT/flatpak/com.houston.app.metainfo.xml" "$STAGE/share/metainfo/com.houston.app.metainfo.xml"
install -m 0644 "$ICON_SRC" "$STAGE/share/icons/hicolor/256x256/apps/com.houston.app.png"
cp -a "$ROOT/store" "$STAGE/share/houston/store"

if [ -d "$RESOURCE_BIN_SRC" ]; then
  cp -a "$RESOURCE_BIN_SRC/." "$STAGE/bin/resources/bin/"
fi

printf '==> Build Flatpak repo\n'
flatpak-builder --force-clean --repo="$REPO_DIR" "$BUILD_DIR" "$ROOT/flatpak/com.houston.app.yml"

mkdir -p "$(dirname "$BUNDLE_PATH")"
printf '==> Export bundle %s\n' "$BUNDLE_PATH"
flatpak build-bundle "$REPO_DIR" "$BUNDLE_PATH" com.houston.app

cat <<EOF
Done.

Bundle:
  $BUNDLE_PATH

Install locally:
  flatpak install --user --bundle "$BUNDLE_PATH"
  flatpak run com.houston.app
EOF
