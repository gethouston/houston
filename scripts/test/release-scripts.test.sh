#!/usr/bin/env bash
# Cross-OS regression test for the release-cut scripts (version.sh, bump-cli.sh).
#
# These scripts MUST produce byte-identical, LF-only output on macOS, Linux,
# and Windows git-bash. This test builds a throwaway fixture repo, runs the
# scripts against it, and asserts:
#   * version.sh edits ONLY the intended version lines (byte-golden compare),
#     leaving 3-part dependency pins and nested "version" keys untouched, and
#     scoping the root Cargo.toml bump to houston-* `path =` deps only.
#   * bump-cli.sh bumps the targeted CLI's version + clears its checksums and
#     leaves sibling CLIs untouched.
#   * NO output file contains a CR byte — the Windows CRLF regression that the
#     old `jq` rewrite and `sed -i ''` used to introduce.
#
# Run it on EVERY OS you cut releases from. Identical PASS output across macOS,
# Linux, and Windows git-bash is the proof the scripts behave the same way.
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

mkdir -p "$TMP/scripts" "$TMP/app/houston-tauri" "$TMP/app/src-tauri" \
         "$TMP/engine/houston-a" "$TMP/expected"
cp "$SCRIPTS_DIR/version.sh" "$SCRIPTS_DIR/bump-cli.sh" "$TMP/scripts/"

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

# Engine crate: [package] version must bump; the dependency version lines
# (bare "1" and 3-part "1.2.3") must NOT.
cat > "$TMP/engine/houston-a/Cargo.toml" <<'EOF'
[package]
name = "houston-a"
version = "0.0.1"
edition = "2021"

[dependencies]
thiserror = "1"

[dependencies.serde]
version = "1.2.3"
EOF
cat > "$TMP/expected/houston-a.Cargo.toml" <<'EOF'
[package]
name = "houston-a"
version = "9.9.9"
edition = "2021"

[dependencies]
thiserror = "1"

[dependencies.serde]
version = "1.2.3"
EOF

# The two app crates the script lists explicitly.
for c in houston-tauri src-tauri; do
  printf '[package]\nname = "%s"\nversion = "0.0.1"\n' "$c" > "$TMP/app/$c/Cargo.toml"
done

# Root Cargo.toml: serde (third-party, NO path) must stay pinned; houston-a
# (workspace member, HAS path) must bump. This is the core of the path-scoped
# substitution that replaced the macOS-only `sed -i ''` global replace.
cat > "$TMP/Cargo.toml" <<'EOF'
[workspace]
members = ["engine/houston-a"]

[workspace.dependencies]
serde = { version = "1.2.3", features = ["derive"] }
houston-a = { version = "0.0.1", path = "engine/houston-a" }
EOF
cat > "$TMP/expected/Cargo.toml" <<'EOF'
[workspace]
members = ["engine/houston-a"]

[workspace.dependencies]
serde = { version = "1.2.3", features = ["derive"] }
houston-a = { version = "9.9.9", path = "engine/houston-a" }
EOF

# ---------------------------------------------------------------------------
# Run version.sh and assert
# ---------------------------------------------------------------------------
echo "== version.sh =="
( cd "$TMP" && bash scripts/version.sh 9.9.9 ) > /dev/null

assert_same "package.json: top version bumped, dep + nested version kept" \
  "$TMP/package.json" "$TMP/expected/package.json"
assert_same "engine Cargo.toml: [package] bumped, dep versions kept" \
  "$TMP/engine/houston-a/Cargo.toml" "$TMP/expected/houston-a.Cargo.toml"
assert_same "root Cargo.toml: path dep bumped, third-party pin kept" \
  "$TMP/Cargo.toml" "$TMP/expected/Cargo.toml"

for d in app ui/core ui/chat ui/board ui/layout ui/skills ui/events ui/routines ui/review; do
  assert_str "$d/package.json version" "$(jq -r .version "$TMP/$d/package.json")" "9.9.9"
done
for c in houston-tauri src-tauri; do
  assert_str "app/$c version" \
    "$(perl -ne 'print $1 if /^version = "([^"]+)"$/' "$TMP/app/$c/Cargo.toml")" "9.9.9"
done

# Reject a non-semver argument (the validation guard).
if ( cd "$TMP" && bash scripts/version.sh not.a.version ) > /dev/null 2>&1; then
  bad "version.sh accepted a non-semver argument"
else
  ok "version.sh rejects non-semver argument"
fi

for f in "$TMP/package.json" "$TMP/Cargo.toml" "$TMP/engine/houston-a/Cargo.toml" \
         "$TMP/app/houston-tauri/Cargo.toml" "$TMP/ui/core/package.json"; do
  assert_no_cr "${f#"$TMP"/}" "$f"
done

# ---------------------------------------------------------------------------
# Fixtures + run for bump-cli.sh
# ---------------------------------------------------------------------------
echo "== bump-cli.sh =="
cat > "$TMP/cli-deps.json" <<'EOF'
{
  "$schema": "./cli-deps.schema.json",
  "alpha": {
    "version": "1.0.0",
    "checksums": {
      "darwin-arm64": "deadbeef"
    }
  },
  "beta": {
    "version": "2.0.0",
    "checksums": {
      "windows-x64": "cafef00d"
    }
  }
}
EOF

( cd "$TMP" && bash scripts/bump-cli.sh alpha 9.9.9 ) > /dev/null

assert_str "alpha version bumped"        "$(jq -r '.alpha.version' "$TMP/cli-deps.json")" "9.9.9"
assert_str "alpha checksums cleared"     "$(jq '.alpha.checksums | length' "$TMP/cli-deps.json")" "0"
assert_str "beta version untouched"      "$(jq -r '.beta.version' "$TMP/cli-deps.json")" "2.0.0"
assert_str "beta checksums untouched"    "$(jq -r '.beta.checksums."windows-x64"' "$TMP/cli-deps.json")" "cafef00d"
assert_no_cr "cli-deps.json" "$TMP/cli-deps.json"

# Unknown CLI must fail, not silently no-op.
if ( cd "$TMP" && bash scripts/bump-cli.sh nope 1.0.0 ) > /dev/null 2>&1; then
  bad "bump-cli.sh accepted an unknown CLI"
else
  ok "bump-cli.sh rejects an unknown CLI"
fi

# ---------------------------------------------------------------------------
echo
printf 'PASS %d  FAIL %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
