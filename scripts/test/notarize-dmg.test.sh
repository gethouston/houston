#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NOTARIZE="$ROOT/scripts/ci/notarize-dmg.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"

cat >"$TMP/bin/xcrun" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
case "$1 $2" in
  "notarytool submit") queue=submit ;;
  "notarytool wait") queue=wait ;;
  "notarytool log") queue=log ;;
  "stapler staple") queue="staple-$(basename "$3")" ;;
  *) echo "fake xcrun: unexpected $*" >&2; exit 99 ;;
esac
echo "$queue" >>"$FAKE/calls"
echo "$*" >>"$FAKE/argv"
file="$FAKE/$queue"
line=$(head -n 1 "$file")
if [ "$(wc -l <"$file")" -gt 1 ]; then tail -n +2 "$file" >"$file.next" && mv "$file.next" "$file"; fi
code="${line%% *}"
out="${line#* }"
[ "$out" = "-" ] || printf '%s\n' "$out"
exit "$code"
EOF
chmod +x "$TMP/bin/xcrun"

ID='{"id":"abc-123","message":"Successfully uploaded file"}'
ACCEPTED='{"id":"abc-123","status":"Accepted","message":"Processing complete"}'
IN_PROGRESS='{"id":"abc-123","status":"In Progress"}'
INVALID='{"id":"abc-123","status":"Invalid","message":"Processing complete"}'

scenario() {
  local name="$1" want="$2" deadline="$3"
  shift 3
  export FAKE="$TMP/$name"
  mkdir -p "$FAKE"
  local spec
  for spec in "$@"; do
    printf '%b\n' "${spec#*=}" >"$FAKE/${spec%%=*}"
  done
  local got=0
  PATH="$TMP/bin:$PATH" APPLE_API_KEY=k APPLE_API_ISSUER=i APPLE_API_KEY_PATH=/dev/null \
    NOTARY_DEADLINE_SECONDS="$deadline" NOTARY_RETRY_BASE_SECONDS="${BASE:-0}" NOTARY_STAPLE_ATTEMPTS=3 \
    "$NOTARIZE" "$TMP/Houston.dmg" "$TMP/Houston.app" >"$FAKE/out" 2>&1 || got=$?
  if [ "$got" -ne "$want" ]; then
    echo "FAIL $name: exit $got, want $want"
    cat "$FAKE/out"
    exit 1
  fi
}
calls() { grep -c "^$2\$" "$TMP/$1/calls" || true; }
expect_calls() {
  local got
  got=$(calls "$1" "$2")
  if [ "$got" -ne "$3" ]; then
    echo "FAIL $1: $2 called $got times, want $3"
    cat "$TMP/$1/calls"
    exit 1
  fi
}
expect_out() {
  if ! grep -qF "$2" "$TMP/$1/out"; then
    echo "FAIL $1: output lacks '$2'"
    cat "$TMP/$1/out"
    exit 1
  fi
}

scenario flaky 0 60 \
  "submit=1 -\n0 $ID" \
  "wait=1 -\n1 -\n1 $IN_PROGRESS\n0 $ACCEPTED" \
  "staple-Houston.dmg=65 -\n0 -" \
  "staple-Houston.app=0 -"
expect_calls flaky submit 2
expect_calls flaky wait 4
expect_calls flaky staple-Houston.dmg 2
expect_calls flaky staple-Houston.app 1
if grep "^notarytool wait" "$TMP/flaky/argv" | grep -vqE '^notarytool wait abc-123 --timeout [0-9]+ '; then
  echo "FAIL flaky: a wait was not on abc-123 with --timeout"
  grep "^notarytool wait" "$TMP/flaky/argv"
  exit 1
fi

scenario invalid 1 60 "submit=0 $ID" "wait=0 $INVALID" "log=0 {\"issues\":[]}"
expect_calls invalid submit 1
expect_calls invalid wait 1
expect_calls invalid log 1
expect_calls invalid staple-Houston.dmg 0
expect_out invalid "Apple returned Invalid"

scenario deadline 1 2 "submit=0 $ID" "wait=1 -"
expect_calls deadline submit 1
expect_out deadline "No notarization verdict for submission abc-123 before the deadline"

START=$SECONDS
BASE=1 scenario capped 1 4 "submit=0 $ID" "wait=1 -"
ELAPSED=$((SECONDS - START))
if [ "$ELAPSED" -lt 3 ] || [ "$ELAPSED" -gt 5 ]; then
  echo "FAIL capped: took ${ELAPSED}s, want about 4"
  exit 1
fi
expect_out capped "before the deadline"

scenario no-app-ticket 1 60 "submit=0 $ID" "wait=0 $ACCEPTED" \
  "staple-Houston.dmg=0 -" "staple-Houston.app=65 -"
expect_calls no-app-ticket staple-Houston.app 3
expect_out no-app-ticket "Could not staple"

scenario no-upload 1 2 "submit=1 -"
expect_calls no-upload wait 0
expect_out no-upload "Could not upload the DMG"

echo "notarize-dmg.sh: all scenarios passed"
