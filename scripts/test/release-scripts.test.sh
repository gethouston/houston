#!/usr/bin/env bash
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")/.." && pwd)"

pass=0 fail=0
ok()  { printf '  ok   %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf '  FAIL %s\n' "$1"; fail=$((fail + 1)); }

assert_same() {
  if cmp -s "$2" "$3"; then ok "$1"; else bad "$1"; diff "$3" "$2" || true; fi
}
assert_str() {
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi
}
assert_no_cr() {
  if perl -0777 -ne 'exit(/\r/ ? 1 : 0)' "$2"; then ok "no CRLF: $1"; else bad "CRLF in $1"; fi
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/scripts" "$TMP/app/src-tauri" "$TMP/expected"
cp "$SCRIPTS_DIR/version.sh" "$TMP/scripts/"

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

for d in app ui/core ui/chat ui/board ui/layout ui/skills ui/events ui/routines ui/review; do
  mkdir -p "$TMP/$d"
  printf '{\n  "name": "%s",\n  "version": "0.0.1"\n}\n' "$d" > "$TMP/$d/package.json"
done

printf '[package]\nname = "src-tauri"\nversion = "0.0.1"\n' > "$TMP/app/src-tauri/Cargo.toml"
mkdir -p "$TMP/app/src-tauri/src"
: > "$TMP/app/src-tauri/src/lib.rs"

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

if ( cd "$TMP" && bash scripts/version.sh not.a.version ) > /dev/null 2>&1; then
  bad "version.sh accepted a non-semver argument"
else
  ok "version.sh rejects non-semver argument"
fi

for f in "$TMP/package.json" "$TMP/Cargo.toml" \
         "$TMP/app/src-tauri/Cargo.toml" "$TMP/ui/core/package.json"; do
  assert_no_cr "${f#"$TMP"/}" "$f"
done

echo
printf 'PASS %d  FAIL %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
