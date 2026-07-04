#!/usr/bin/env bash
# Cross-OS regression test for the release-cut version bumper (version.sh).
#
# version.sh MUST produce byte-identical, LF-only output on macOS, Linux,
# and Windows git-bash. This test builds a throwaway fixture repo, runs the
# script against it, and asserts:
#   * version.sh edits ONLY the intended version lines (byte-golden compare),
#     leaving 3-part dependency pins and nested "version" keys untouched, and
#     scoping the root Cargo.toml bump to houston-* `path =` deps only.
#   * NO output file contains a CR byte — the Windows CRLF regression that the
#     old `jq` rewrite and `sed -i ''` used to introduce.
#
# Run it on EVERY OS you cut releases from. Identical PASS output across macOS,
# Linux, and Windows git-bash is the proof the script behaves the same way.
# Requires only bash, perl, jq, diff/cmp — all present in git-bash. Never
# touches the real repo files (everything happens in a temp dir).
#
#   Usage: ./scripts/test/release-scripts.test.sh
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")/.." && pwd)"   # the scripts/ dir under test

pass=0 fail=0
ok()  { printf '  ok   %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf '  FAIL %s\n' "$1"; fail=$((fail + 1)); }

# Byte-exact comparison (catches CRLF, trailing-newline, and content drift).
assert_same() { # <label> <actual_file> <expected_file>
  if cmp -s "$2" "$3"; then ok "$1"; else bad "$1"; diff "$3" "$2" || true; fi
}
assert_str() { # <label> <actual> <expected>
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi
}
# A CR byte anywhere means a Windows jq/sed rewrite leaked CRLF.
assert_no_cr() { # <label> <file>
  if perl -0777 -ne 'exit(/\r/ ? 1 : 0)' "$2"; then ok "no CRLF: $1"; else bad "CRLF in $1"; fi
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/scripts" "$TMP/app/src-tauri" "$TMP/expected"
cp "$SCRIPTS_DIR/version.sh" "$TMP/scripts/"

# ---------------------------------------------------------------------------
# Fixtures for version.sh
# ---------------------------------------------------------------------------

# Root package.json: a 3-part dependency pin ("left-pad") and a nested
# "version" key, both of which MUST survive untouched — only the top-level
# package version may change.
cat > "$TMP/package.json" <<'EOF'
{
  "name": "houston",
  "version": "0.0.1",
  "dependencies": {
    "left-pad": "1.2.3"
  },
  "config": {
    "version": "0.0.1"
  }
}
EOF
cat > "$TMP/expected/package.json" <<'EOF'
{
  "name": "houston",
  "version": "9.9.9",
  "dependencies": {
    "left-pad": "1.2.3"
  },
  "config": {
    "version": "0.0.1"
  }
}
EOF

# The simple packages the script also bumps (root app + the 8 ui packages).
for d in app ui/core ui/chat ui/board ui/layout ui/skills ui/events ui/routines ui/review; do
  mkdir -p "$TMP/$d"
  printf '{\n  "name": "%s",\n  "version": "0.0.1"\n}\n' "$d" > "$TMP/$d/package.json"
done

# The one Rust crate the script still bumps: app/src-tauri (the Tauri shell;
# the legacy engine/* crates and app/houston-tauri are gone). Its [package]
# version must bump.
printf '[package]\nname = "src-tauri"\nversion = "0.0.1"\n' > "$TMP/app/src-tauri/Cargo.toml"

# Root Cargo.toml: serde (third-party, NO path) must stay pinned; the houston-*
# workspace member (HAS path) must bump. This is the core of the path-scoped
# substitution that replaced the macOS-only `sed -i ''` global replace.
cat > "$TMP/Cargo.toml" <<'EOF'
[workspace]
members = ["app/src-tauri"]

[workspace.dependencies]
serde = { version = "1.2.3", features = ["derive"] }
houston-shell = { version = "0.0.1", path = "app/src-tauri" }
EOF
cat > "$TMP/expected/Cargo.toml" <<'EOF'
[workspace]
members = ["app/src-tauri"]

[workspace.dependencies]
serde = { version = "1.2.3", features = ["derive"] }
houston-shell = { version = "9.9.9", path = "app/src-tauri" }
EOF

# ---------------------------------------------------------------------------
# Run version.sh and assert
# ---------------------------------------------------------------------------
echo "== version.sh =="
( cd "$TMP" && bash scripts/version.sh 9.9.9 ) > /dev/null

assert_same "package.json: top version bumped, dep + nested version kept" \
  "$TMP/package.json" "$TMP/expected/package.json"
assert_same "root Cargo.toml: path dep bumped, third-party pin kept" \
  "$TMP/Cargo.toml" "$TMP/expected/Cargo.toml"

for d in app ui/core ui/chat ui/board ui/layout ui/skills ui/events ui/routines ui/review; do
  assert_str "$d/package.json version" "$(jq -r .version "$TMP/$d/package.json")" "9.9.9"
done
assert_str "app/src-tauri version" \
  "$(perl -ne 'print $1 if /^version = "([^"]+)"$/' "$TMP/app/src-tauri/Cargo.toml")" "9.9.9"

# Reject a non-semver argument (the validation guard).
if ( cd "$TMP" && bash scripts/version.sh not.a.version ) > /dev/null 2>&1; then
  bad "version.sh accepted a non-semver argument"
else
  ok "version.sh rejects non-semver argument"
fi

for f in "$TMP/package.json" "$TMP/Cargo.toml" \
         "$TMP/app/src-tauri/Cargo.toml" "$TMP/ui/core/package.json"; do
  assert_no_cr "${f#"$TMP"/}" "$f"
done

# ---------------------------------------------------------------------------
echo
printf 'PASS %d  FAIL %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
