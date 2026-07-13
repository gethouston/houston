#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPAIR="$ROOT/scripts/ci/repair-linux-appimage-sidecar.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/source-root/usr/bin"

printf 'pristine bun payload\n' >"$TMP/pristine"
chmod +x "$TMP/pristine"
printf 'mutated by patchelf\n' >"$TMP/source-root/usr/bin/houston-engine"
printf 'keep me\n' >"$TMP/source-root/other-file"

# Synthetic AppImage runtime: report a fixed SquashFS offset and materialize an
# AppDir when the repair script asks for extraction.
cat >"$TMP/fake.AppImage" <<EOF
#!/usr/bin/env bash
set -euo pipefail
case "\${1:-}" in
  --appimage-offset) printf '4096\\n' ;;
  --appimage-extract) cp -R "$TMP/source-root" squashfs-root ;;
  *) exit 2 ;;
esac
EOF
chmod +x "$TMP/fake.AppImage"
truncate -s 4096 "$TMP/fake.AppImage"
dd if="$TMP/fake.AppImage" of="$TMP/original-prefix" bs=4096 count=1 2>/dev/null

# The fake SquashFS tools use tar as the payload format. They exercise the
# repair algorithm without requiring Linux, FUSE, or a 200 MB fixture.
cat >"$TMP/bin/mksquashfs" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
source="$1"
output="$2"
tar -C "$source" -cf "$output" .
EOF
cat >"$TMP/bin/unsquashfs" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
while [ "$1" != "-cat" ]; do shift; done
shift
image="$1"
path="$2"
tail -c +4097 "$image" | tar -xOf - "./$path"
EOF
chmod +x "$TMP/bin/mksquashfs" "$TMP/bin/unsquashfs"

PATH="$TMP/bin:$PATH" "$REPAIR" "$TMP/fake.AppImage" "$TMP/pristine"
head -c 4096 "$TMP/fake.AppImage" >"$TMP/repaired-prefix"
if command -v sha256sum >/dev/null; then
  test "$(sha256sum "$TMP/repaired-prefix" | cut -d' ' -f1)" = \
    "$(sha256sum "$TMP/original-prefix" | cut -d' ' -f1)"
else
  test "$(shasum -a 256 "$TMP/repaired-prefix" | cut -d' ' -f1)" = \
    "$(shasum -a 256 "$TMP/original-prefix" | cut -d' ' -f1)"
fi
tail -c +4097 "$TMP/fake.AppImage" | tar -xOf - ./usr/bin/houston-engine | cmp "$TMP/pristine" -
test "$(tail -c +4097 "$TMP/fake.AppImage" | tar -xOf - ./other-file)" = "keep me"
echo "PASS: AppImage repair preserves the runtime and restores the pristine sidecar"
