#!/usr/bin/env bash
# ============================================================================
# Behavioral tests for the provisioning scripts' safety rails. These scripts
# cannot run real `gcloud`/`kubectl` in CI, so we test the parts that protect
# the operator: the CONFIRM gate, the env/cmd guards, error surfacing, and the
# cluster-version floor check.
#
# Run:  bash lib.test.sh        (MUST be bash — uses ${!var} + read -p)
# ============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PASS=0
FAIL=0
check() {
  if [ "$1" = "$2" ]; then
    printf 'PASS: %s\n' "$3"; PASS=$((PASS + 1))
  else
    printf 'FAIL: %s (got %q want %q)\n' "$3" "$1" "$2"; FAIL=$((FAIL + 1))
  fi
}

# --- lib.sh: CONFIRM gate ---------------------------------------------------
( . ./lib.sh; ASSUME_YES=0; printf 'nope\n' | confirm "billed" ) >/dev/null 2>&1
check "$?" "1" "confirm aborts on wrong input"
( . ./lib.sh; ASSUME_YES=0; printf 'CONFIRM\n' | confirm "billed" ) >/dev/null 2>&1
check "$?" "0" "confirm proceeds on CONFIRM"
( . ./lib.sh; ASSUME_YES=1; confirm "billed" </dev/null ) >/dev/null 2>&1
check "$?" "0" "confirm bypassed with --yes (ASSUME_YES=1)"

# --- lib.sh: flag parsing ---------------------------------------------------
( . ./lib.sh; parse_common_flags --yes; [ "$ASSUME_YES" = "1" ] )
check "$?" "0" "parse_common_flags --yes sets ASSUME_YES"
( . ./lib.sh; parse_common_flags foo bar; [ "$ASSUME_YES" = "0" ] )
check "$?" "0" "parse_common_flags without flag leaves ASSUME_YES=0"

# --- lib.sh: env / cmd guards (fail fast, never swallow) --------------------
( . ./lib.sh; unset NOPE_VAR; require_env NOPE_VAR ) >/dev/null 2>&1
check "$?" "1" "require_env dies on missing var"
( . ./lib.sh; export SET_VAR=x; require_env SET_VAR ) >/dev/null 2>&1
check "$?" "0" "require_env passes when var set"
( . ./lib.sh; require_cmd definitely-not-a-real-command-xyz ) >/dev/null 2>&1
check "$?" "1" "require_cmd dies on missing cmd"

# --- lib.sh: run / run_billed surface failures ------------------------------
( . ./lib.sh; run false ) >/dev/null 2>&1
check "$?" "1" "run aborts on command failure"
( . ./lib.sh; run true ) >/dev/null 2>&1
check "$?" "0" "run succeeds on ok command"
( . ./lib.sh; ASSUME_YES=1; run_billed "reason" true ) >/dev/null 2>&1
check "$?" "1" "run_billed dies without -- separator"
( . ./lib.sh; ASSUME_YES=1; run_billed "reason" -- true ) >/dev/null 2>&1
check "$?" "0" "run_billed runs with -- and --yes"
out="$( . ./lib.sh; ASSUME_YES=1; run_billed "make a cluster" -- echo HELLO 2>&1 )"
echo "$out" | grep -q "about to run (BILLED):" && echo "$out" | grep -q "echo HELLO"
check "$?" "0" "run_billed echoes exact command + billed warning"

# --- 02-cluster.sh: version floor guard (semver_ge) -------------------------
eval "$(awk '/^semver_ge\(\)/{f=1} f{print} /^}/{if(f){f=0}}' 02-cluster.sh)"
FLOOR="1.35.2-gke.1269000"
semver_ge "$FLOOR" "$FLOOR"; check "$?" "0" "semver_ge: equal version accepted"
semver_ge "1.35.2-gke.1269001" "$FLOOR"; check "$?" "0" "semver_ge: one gke-build higher accepted"
semver_ge "1.35.2-gke.1268999" "$FLOOR"; check "$?" "1" "semver_ge: one gke-build lower REJECTED"
semver_ge "1.36.0-gke.0" "$FLOOR"; check "$?" "0" "semver_ge: higher minor accepted"
semver_ge "1.35.1-gke.9999999" "$FLOOR"; check "$?" "1" "semver_ge: lower patch REJECTED despite big build"
semver_ge "1.34.9-gke.9999999" "$FLOOR"; check "$?" "1" "semver_ge: lower minor REJECTED"
semver_ge "2.0.0-gke.1" "$FLOOR"; check "$?" "0" "semver_ge: higher major accepted"

# --- all scripts parse (bash -n) --------------------------------------------
for f in lib.sh 00-project.sh 01-apis.sh 02-cluster.sh 03-verify-sandbox.sh; do
  bash -n "$f" >/dev/null 2>&1
  check "$?" "0" "bash -n syntax: ${f}"
done

printf -- '---\nPASS=%d FAIL=%d\n' "$PASS" "$FAIL"
[ "$FAIL" = "0" ]
