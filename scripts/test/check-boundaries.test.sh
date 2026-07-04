#!/usr/bin/env bash
# Regression test for the open/closed boundary check (check-boundaries.mjs).
#
# Builds a throwaway open/closed package tree, copies the real script in (it
# computes its root relative to its own location, so it checks the fixture), and
# asserts:
#   * a clean tree passes (exit 0);
#   * every leak vector the script is supposed to catch FAILS (exit 1) with the
#     expected message — the three holes from HOU-584 plus the pre-existing ones:
#       - deep-relative import into packages/host-cloud (Hole 1)
#       - require() of a cloud lib                      (Hole 2)
#       - an UNDECLARED bare import (novel cloud dep)    (Hole 3, allowlist half)
#       - a cloud lib / closed package DECLARED in an open package.json (Hole 3, manifest)
#       - a bare @houston/host-cloud import              (the original check)
#       - a cloud lib imported by a non-allowlisted file
#       - a reappearing packages/host-cloud dir (Rule B — it moved out of the repo)
#   * a commented-out cloud import does NOT false-fail (comment stripping);
#   * the runtime's GcsStore adapter + dep are the one allowed exception.
#
# Never touches the real repo (everything happens in a temp dir).
#
#   Usage: ./scripts/test/check-boundaries.test.sh
set -uo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")/.." && pwd)"   # the scripts/ dir under test

pass=0 fail=0
ok()  { printf '  ok   %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf '  FAIL %s\n' "$1"; fail=$((fail + 1)); }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/scripts"
cp "$SCRIPTS_DIR/check-boundaries.mjs" "$TMP/scripts/"

# Run the checker against the fixture; sets OUT + RC without tripping the shell.
run() { OUT="$(cd "$TMP" && node scripts/check-boundaries.mjs 2>&1)" && RC=0 || RC=$?; }

assert_pass() { # <label>
  run
  if [ "$RC" -eq 0 ]; then ok "$1"; else bad "$1 (expected pass, got rc=$RC)"; printf '%s\n' "$OUT"; fi
}
assert_fail() { # <label> <substring>
  run
  if [ "$RC" -ne 0 ] && printf '%s' "$OUT" | grep -qF "$2"; then
    ok "$1"
  else
    bad "$1 (expected fail containing '$2', got rc=$RC)"; printf '%s\n' "$OUT"
  fi
}

# ---------------------------------------------------------------------------
# Clean fixture: the open packages only — the closed control plane lives
# outside this repository, so a clean tree has NO packages/host-cloud.
# ---------------------------------------------------------------------------
reset_fixture() {
  rm -rf "$TMP/packages" "$TMP/ui"

  mkdir -p "$TMP/packages/protocol/src"
  printf '{"name":"@houston/protocol","version":"0.0.0"}\n' > "$TMP/packages/protocol/package.json"
  printf 'export const V = 3;\n' > "$TMP/packages/protocol/src/index.ts"

  mkdir -p "$TMP/packages/domain/src"
  printf '{"name":"@houston/domain","version":"0.0.0","dependencies":{"yaml":"^2","@houston/protocol":"workspace:*"}}\n' > "$TMP/packages/domain/package.json"
  printf 'import { parse } from "yaml";\nimport { V } from "@houston/protocol";\nexport const x = parse;\nexport const v = V;\n' > "$TMP/packages/domain/src/index.ts"

  # runtime: the ONE documented cloud exception (GcsStore + its wiring point).
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

# Hole 1 — deep-relative import that resolves into host-cloud.
reset_fixture
printf 'import pg from "../../host-cloud/src/store/pg";\nexport const p = pg;\n' > "$TMP/packages/host/src/leak.ts"
assert_fail "deep-relative import into host-cloud is caught" "closed package via path"

# Hole 2 — require() of a cloud lib (the regex now has a require branch).
reset_fixture
printf 'const pg = require("pg");\nmodule.exports = pg;\n' > "$TMP/packages/host/src/leak.ts"
assert_fail "require() of a cloud lib is caught" 'cloud lib "pg"'

# Hole 3a — an undeclared bare import (a novel cloud dep the denylist can't see).
reset_fixture
printf 'import { S3 } from "@vendor/cloud-db";\nexport const s = S3;\n' > "$TMP/packages/host/src/leak.ts"
assert_fail "undeclared bare import is caught" "undeclared import"

# Hole 3b — a cloud lib declared in an open package.json (manifest check).
reset_fixture
printf '{"name":"@houston/host","version":"0.0.0","dependencies":{"@houston/domain":"workspace:*","@aws-sdk/client-s3":"^3"}}\n' > "$TMP/packages/host/package.json"
assert_fail "cloud lib declared in an open manifest is caught" "declares cloud lib"

# Hole 3c — the closed package declared as a dependency of an open package.
reset_fixture
printf '{"name":"@houston/domain","version":"0.0.0","dependencies":{"yaml":"^2","@houston/protocol":"workspace:*","@houston/host-cloud":"file:../host-cloud"}}\n' > "$TMP/packages/domain/package.json"
assert_fail "closed package declared in an open manifest is caught" "declares the closed package"

# The original check still holds — a bare @houston/host-cloud import.
reset_fixture
printf 'import { Gke } from "@houston/host-cloud";\nexport const g = Gke;\n' > "$TMP/packages/host/src/leak.ts"
assert_fail "bare @houston/host-cloud import is caught" 'closed package "@houston/host-cloud"'

# A cloud lib imported by a file that is NOT the runtime adapter.
reset_fixture
printf 'import { Storage } from "@google-cloud/storage";\nexport const s = Storage;\n' > "$TMP/packages/runtime/src/other.ts"
assert_fail "cloud lib in a non-allowlisted file is caught" 'cloud lib "@google-cloud/storage"'

# Rule B — the closed package must not reappear under its old path.
reset_fixture
mkdir -p "$TMP/packages/host-cloud/src"
printf 'import pg from "pg";\nexport const p = pg;\n' > "$TMP/packages/host-cloud/src/pg.ts"
assert_fail "reappearing host-cloud package is caught" "must not exist"

# Comment stripping — a commented-out cloud import must NOT false-fail.
reset_fixture
cat > "$TMP/packages/host/src/commented.ts" <<'EOF'
// import { Pg } from "pg";
/* import { Gke } from "@houston/host-cloud"; */
import { x } from "@houston/domain";
export const v = x;
EOF
assert_pass "commented-out cloud import does not false-fail"

# ---------------------------------------------------------------------------
echo
printf 'PASS %d  FAIL %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
