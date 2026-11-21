#!/usr/bin/env bash
set -uo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")/.." && pwd)"

pass=0 fail=0
ok()  { printf '  ok   %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf '  FAIL %s\n' "$1"; fail=$((fail + 1)); }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/scripts"
cp "$SCRIPTS_DIR/check-boundaries.mjs" "$TMP/scripts/"

run() { OUT="$(cd "$TMP" && node scripts/check-boundaries.mjs 2>&1)" && RC=0 || RC=$?; }

assert_pass() {
  run
  if [ "$RC" -eq 0 ]; then ok "$1"; else bad "$1 (expected pass, got rc=$RC)"; printf '%s\n' "$OUT"; fi
}
assert_fail() {
  run
  if [ "$RC" -ne 0 ] && printf '%s' "$OUT" | grep -qF "$2"; then
    ok "$1"
  else
    bad "$1 (expected fail containing '$2', got rc=$RC)"; printf '%s\n' "$OUT"
  fi
}

reset_fixture() {
  rm -rf "$TMP/packages" "$TMP/ui"

  mkdir -p "$TMP/packages/protocol/src"
  printf '{"name":"@houston/protocol","version":"0.0.0"}\n' > "$TMP/packages/protocol/package.json"
  printf 'export const V = 3;\n' > "$TMP/packages/protocol/src/index.ts"

  mkdir -p "$TMP/packages/domain/src"
  printf '{"name":"@houston/domain","version":"0.0.0","dependencies":{"yaml":"^2","@houston/protocol":"workspace:*"}}\n' > "$TMP/packages/domain/package.json"
  printf 'import { parse } from "yaml";\nimport { V } from "@houston/protocol";\nexport const x = parse;\nexport const v = V;\n' > "$TMP/packages/domain/src/index.ts"

  mkdir -p "$TMP/packages/runtime/src/turn"
  printf '{"name":"@houston/runtime","version":"0.0.0","dependencies":{"@google-cloud/storage":"^7"}}\n' > "$TMP/packages/runtime/package.json"
  printf 'import { Storage } from "@google-cloud/storage";\nexport const s = Storage;\n' > "$TMP/packages/runtime/src/turn/gcs-store.ts"
  printf 'export async function load() {\n  const m = await import("@google-cloud/storage");\n  return m;\n}\n' > "$TMP/packages/runtime/src/main.ts"

  mkdir -p "$TMP/packages/runtime-client/src"
  printf '{"name":"@houston/runtime-client","version":"0.0.0"}\n' > "$TMP/packages/runtime-client/package.json"
  printf 'export const c = 1;\n' > "$TMP/packages/runtime-client/src/index.ts"

  mkdir -p "$TMP/packages/host/src"
  printf '{"name":"@houston/host","version":"0.0.0","dependencies":{"@houston/domain":"workspace:*"}}\n' > "$TMP/packages/host/package.json"
  printf 'import { x } from "@houston/domain";\nimport { join } from "node:path";\nexport const s = [x, join];\n' > "$TMP/packages/host/src/server.ts"

  mkdir -p "$TMP/ui/core/src"
  printf '{"name":"@houston-ai/core","version":"0.0.0","dependencies":{"react":"^19"}}\n' > "$TMP/ui/core/package.json"
  printf 'import React from "react";\nexport const C = React;\n' > "$TMP/ui/core/src/index.tsx"
}

echo "== check-boundaries.mjs =="

reset_fixture
assert_pass "clean open/closed tree passes"

reset_fixture
printf 'import pg from "../../host-cloud/src/store/pg";\nexport const p = pg;\n' > "$TMP/packages/host/src/leak.ts"
assert_fail "deep-relative import into host-cloud is caught" "closed package via path"

reset_fixture
printf 'const pg = require("pg");\nmodule.exports = pg;\n' > "$TMP/packages/host/src/leak.ts"
assert_fail "require() of a cloud lib is caught" 'cloud lib "pg"'

reset_fixture
printf 'import { S3 } from "@vendor/cloud-db";\nexport const s = S3;\n' > "$TMP/packages/host/src/leak.ts"
assert_fail "undeclared bare import is caught" "undeclared import"

reset_fixture
printf '{"name":"@houston/host","version":"0.0.0","dependencies":{"@houston/domain":"workspace:*","@aws-sdk/client-s3":"^3"}}\n' > "$TMP/packages/host/package.json"
assert_fail "cloud lib declared in an open manifest is caught" "declares cloud lib"

reset_fixture
printf '{"name":"@houston/domain","version":"0.0.0","dependencies":{"yaml":"^2","@houston/protocol":"workspace:*","@houston/host-cloud":"file:../host-cloud"}}\n' > "$TMP/packages/domain/package.json"
assert_fail "closed package declared in an open manifest is caught" "declares the closed package"

reset_fixture
printf 'import { Gke } from "@houston/host-cloud";\nexport const g = Gke;\n' > "$TMP/packages/host/src/leak.ts"
assert_fail "bare @houston/host-cloud import is caught" 'closed package "@houston/host-cloud"'

reset_fixture
printf 'import { Storage } from "@google-cloud/storage";\nexport const s = Storage;\n' > "$TMP/packages/runtime/src/other.ts"
assert_fail "cloud lib in a non-allowlisted file is caught" 'cloud lib "@google-cloud/storage"'

reset_fixture
mkdir -p "$TMP/packages/host-cloud/src"
printf 'import pg from "pg";\nexport const p = pg;\n' > "$TMP/packages/host-cloud/src/pg.ts"
assert_fail "reappearing host-cloud package is caught" "must not exist"

reset_fixture
mkdir -p "$TMP/packages/host-cloud/node_modules/pg" "$TMP/packages/host-cloud/dist"
printf '{"name":"pg"}\n' > "$TMP/packages/host-cloud/node_modules/pg/package.json"
assert_pass "leftover host-cloud build artifacts do not false-fail Rule B"

reset_fixture
mkdir -p "$TMP/packages/rogue-cloud/src"
printf '{"name":"@houston/rogue-cloud","version":"0.0.0"}\n' > "$TMP/packages/rogue-cloud/package.json"
printf 'import pg from "pg";\nexport const p = pg;\n' > "$TMP/packages/rogue-cloud/src/index.ts"
assert_fail "cloud import in a brand-new package is caught" 'cloud lib "pg"'

reset_fixture
printf 'import { App } from "@houston/app/App";\nexport const a = App;\n' > "$TMP/packages/host/src/aliased.ts"
assert_pass "repo-scoped alias import does not false-fail rule (d)"

reset_fixture
cat > "$TMP/packages/host/src/commented.ts" <<'EOF'
// import { Pg } from "pg";
/* import { Gke } from "@houston/host-cloud"; */
import { x } from "@houston/domain";
export const v = x;
EOF
assert_pass "commented-out cloud import does not false-fail"

reset_fixture
cat > "$TMP/packages/host/src/string-froms.ts" <<'EOF'
import { x } from "@houston/domain";
export const title = "who it came from";
export const also = `derived from`;
export const union = title ? "own" : "peer";
export const v = x;
EOF
assert_pass "a string ending in the word from does not false-fail"

reset_fixture
mkdir -p "$TMP/app/src/components"
printf 'import { getEngine } from "../lib/engine";\nexport const v = getEngine();\n' \
  > "$TMP/app/src/components/bypasser.ts"
assert_fail "an undeclared getEngine() caller is caught" \
  '[D] app/src/components/bypasser.ts calls getEngine() directly'

printf 'export const v = 1;\n' > "$TMP/app/src/components/bypasser.ts"
assert_fail "a stale bypass entry is caught" 'no longer calls getEngine()'
rm -rf "$TMP/app"

echo
printf 'PASS %d  FAIL %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
