#!/usr/bin/env bash
# Restore the Bun-compiled binaries after linuxdeploy mutates their ELF RUNPATH.
#
# Bun standalone executables append their bundled JavaScript payload to the ELF.
# linuxdeploy's patchelf pass adds $ORIGIN/../lib to every dynamic executable,
# and the rewritten binaries crash in ld.so (SIGSEGV in its symbol-version
# check) before any of their code runs: the host sidecar never prints its
# startup banner, and the bundled `claude` dies on every command, which broke
# Claude sign-in on Linux ("exit signal 11"). Rebuild the AppImage's SquashFS
# with both pristine, already-verified binaries.
set -euo pipefail

USAGE="usage: repair-linux-appimage-sidecar.sh <AppImage> <pristine-host-sidecar> <pristine-claude>"
APPIMAGE="${1:?$USAGE}"
PRISTINE_HOST="${2:?$USAGE}"
PRISTINE_CLAUDE="${3:?$USAGE}"

APPIMAGE="$(realpath "$APPIMAGE")"
[ -x "$APPIMAGE" ] || { echo "ERROR: AppImage is not executable: $APPIMAGE" >&2; exit 1; }
# AppDir path -> pristine binary.
RESTORE=("usr/bin/houston-engine=$(realpath "$PRISTINE_HOST")" "usr/bin/claude=$(realpath "$PRISTINE_CLAUDE")")
for pair in "${RESTORE[@]}"; do
  [ -x "${pair#*=}" ] || { echo "ERROR: pristine binary is not executable: ${pair#*=}" >&2; exit 1; }
done
command -v mksquashfs >/dev/null || { echo "ERROR: mksquashfs is required" >&2; exit 1; }
command -v unsquashfs >/dev/null || { echo "ERROR: unsquashfs is required" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
OFFSET="$("$APPIMAGE" --appimage-offset)"
case "$OFFSET" in
  '' | *[!0-9]*) echo "ERROR: invalid AppImage SquashFS offset: $OFFSET" >&2; exit 1 ;;
esac

(
  cd "$TMP"
  "$APPIMAGE" --appimage-extract >/dev/null
)
ROOT="$TMP/squashfs-root"
node "$(dirname "$0")/assert-no-frpc.mjs" "$ROOT"
for pair in "${RESTORE[@]}"; do
  path="${pair%%=*}"
  pristine="${pair#*=}"
  [ -f "$ROOT/$path" ] || { echo "ERROR: AppImage has no $path" >&2; exit 1; }
  echo "Restoring $path: $(sha256sum "$ROOT/$path" | cut -d' ' -f1) -> $(sha256sum "$pristine" | cut -d' ' -f1)"
  cp "$pristine" "$ROOT/$path"
  chmod 755 "$ROOT/$path"
done

FILESYSTEM="$TMP/filesystem.squashfs"
REPAIRED="$TMP/repaired.AppImage"
mksquashfs "$ROOT" "$FILESYSTEM" \
  -root-owned -noappend -comp zstd -b 131072 \
  -all-time 0 -mkfs-time 0 -no-progress >/dev/null
head -c "$OFFSET" "$APPIMAGE" >"$REPAIRED"
cat "$FILESYSTEM" >>"$REPAIRED"
chmod 755 "$REPAIRED"
mv "$REPAIRED" "$APPIMAGE"

# Read each binary back from the final artifact. This fails closed if repacking
# changed a payload or placed it at the wrong AppImage offset.
EXTRACTED="$TMP/repacked-binary"
for pair in "${RESTORE[@]}"; do
  path="${pair%%=*}"
  unsquashfs -o "$OFFSET" -cat "$APPIMAGE" "$path" >"$EXTRACTED"
  if ! cmp -s "${pair#*=}" "$EXTRACTED"; then
    echo "ERROR: repaired AppImage $path differs from the pristine binary" >&2
    exit 1
  fi
done

echo "Restored the pristine Bun binaries in $APPIMAGE"
