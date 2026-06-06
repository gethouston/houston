#!/usr/bin/env bash
# Materialize vendor/libsql-ffi from the cargo registry and patch build.rs
# so Windows builds do not depend on a Unix `cp` binary.
#
# Required whenever [patch.crates-io] libsql-ffi points at vendor/libsql-ffi.
# vendor/ is gitignored; run this once per clone (CI runs it before cargo build).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/vendor/libsql-ffi"

patch_build_rs() {
  python3 - "$DEST/build.rs" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
old = """    Command::new("cp")
        .arg("--no-preserve=mode,ownership")
        .arg("-R")
        .arg(format!("{dir}/{bindgen_rs_path}"))
        .arg(&out_path)
        .output()
        .unwrap();"""
new = '    std::fs::copy(format!("{dir}/{bindgen_rs_path}"), &out_path).unwrap();'
if old not in text:
    if 'Command::new("cp")' in text:
        raise SystemExit("libsql-ffi build.rs changed upstream; update setup-libsql-ffi-vendor.sh")
    sys.exit(0)
path.write_text(text.replace(old, new), encoding="utf-8", newline="\n")
PY
}

if [[ -f "$DEST/Cargo.toml" ]]; then
  if ! grep -q 'Command::new("cp")' "$DEST/build.rs"; then
    echo "vendor/libsql-ffi already present and patched"
    exit 0
  fi
  echo "vendor/libsql-ffi exists but is unpatched; refreshing"
  rm -rf "$DEST"
fi

CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
shopt -s nullglob
matches=("$CARGO_HOME"/registry/src/*/libsql-ffi-0.5.0)
if ((${#matches[@]} == 0)); then
  echo "Fetching libsql-ffi 0.5.0 into cargo registry..."
  (cd "$ROOT" && cargo fetch -p libsql-ffi)
  matches=("$CARGO_HOME"/registry/src/*/libsql-ffi-0.5.0)
fi

if ((${#matches[@]} == 0)); then
  echo "error: libsql-ffi 0.5.0 not found in cargo registry" >&2
  exit 1
fi

SRC="${matches[0]}"
mkdir -p "$ROOT/vendor"
cp -R "$SRC" "$DEST"
patch_build_rs

if grep -q 'Command::new("cp")' "$DEST/build.rs"; then
  echo "error: failed to patch vendor/libsql-ffi/build.rs" >&2
  exit 1
fi

echo "vendor/libsql-ffi ready at $DEST"
