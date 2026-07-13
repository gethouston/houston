#!/usr/bin/env bash
# Restore the Bun-compiled host after linuxdeploy mutates its ELF RUNPATH.
#
# Bun standalone executables append their bundled JavaScript payload to the ELF.
# linuxdeploy's patchelf pass adds $ORIGIN/../lib to every dynamic executable;
# that rewrite makes the host sidecar segfault before it emits its startup banner.
# Rebuild the AppImage's SquashFS with the pristine, already-verified sidecar.
set -euo pipefail

APPIMAGE="${1:?usage: repair-linux-appimage-sidecar.sh <AppImage> <pristine-sidecar>}"
PRISTINE="${2:?usage: repair-linux-appimage-sidecar.sh <AppImage> <pristine-sidecar>}"

APPIMAGE="$(realpath "$APPIMAGE")"
PRISTINE="$(realpath "$PRISTINE")"
[ -x "$APPIMAGE" ] || { echo "ERROR: AppImage is not executable: $APPIMAGE" >&2; exit 1; }
[ -x "$PRISTINE" ] || { echo "ERROR: pristine sidecar is not executable: $PRISTINE" >&2; exit 1; }
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
PACKAGED="$ROOT/usr/bin/houston-engine"
[ -f "$PACKAGED" ] || { echo "ERROR: AppImage has no usr/bin/houston-engine" >&2; exit 1; }

BEFORE="$(sha256sum "$PACKAGED" | cut -d' ' -f1)"
EXPECTED="$(sha256sum "$PRISTINE" | cut -d' ' -f1)"
cp "$PRISTINE" "$PACKAGED"
chmod 755 "$PACKAGED"

FILESYSTEM="$TMP/filesystem.squashfs"
REPAIRED="$TMP/repaired.AppImage"
mksquashfs "$ROOT" "$FILESYSTEM" \
  -root-owned -noappend -comp zstd -b 131072 \
  -all-time 0 -mkfs-time 0 -no-progress >/dev/null
head -c "$OFFSET" "$APPIMAGE" >"$REPAIRED"
cat "$FILESYSTEM" >>"$REPAIRED"
chmod 755 "$REPAIRED"
mv "$REPAIRED" "$APPIMAGE"

# Read the binary back from the final artifact. This fails closed if repacking
# changed the payload or placed it at the wrong AppImage offset.
EXTRACTED="$TMP/repacked-houston-engine"
unsquashfs -o "$OFFSET" -cat "$APPIMAGE" usr/bin/houston-engine >"$EXTRACTED"
if ! cmp -s "$PRISTINE" "$EXTRACTED"; then
  echo "ERROR: repaired AppImage sidecar differs from the pristine binary" >&2
  exit 1
fi

echo "Restored AppImage host sidecar: $BEFORE -> $EXPECTED"
