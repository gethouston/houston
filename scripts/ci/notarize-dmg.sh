#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "usage: $0 <dmg> <app>" >&2
  exit 2
fi
DMG="$1"
APP="$2"
KEY="${APPLE_API_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${APPLE_API_KEY}.p8}"
DEADLINE=$((SECONDS + ${NOTARY_DEADLINE_SECONDS:-5100}))
BASE="${NOTARY_RETRY_BASE_SECONDS:-15}"
MAX="${NOTARY_RETRY_MAX_SECONDS:-120}"
STAPLE_ATTEMPTS="${NOTARY_STAPLE_ATTEMPTS:-5}"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

notary() {
  xcrun notarytool "$@" --key-id "$APPLE_API_KEY" --key "$KEY" --issuer "$APPLE_API_ISSUER"
}
json_field() { jq -r --arg f "$1" '.[$f] // empty' "$2" 2>/dev/null || true; }
remaining() { echo $((DEADLINE - SECONDS)); }

backoff() {
  local delay=$((BASE * (1 << ($1 - 1 < 6 ? $1 - 1 : 6)))) left
  [ "$delay" -gt "$MAX" ] && delay="$MAX"
  left=$(remaining)
  [ "$delay" -gt "$left" ] && delay="$left"
  [ "$delay" -gt 0 ] && sleep "$delay"
  return 0
}

ID=""
attempt=0
while [ -z "$ID" ]; do
  attempt=$((attempt + 1))
  echo "=== Upload attempt $attempt ==="
  notary submit "$DMG" --output-format json > "$WORK/submit.json" \
    || echo "notarytool submit exited $?"
  cat "$WORK/submit.json"; echo
  ID=$(json_field id "$WORK/submit.json")
  if [ -z "$ID" ]; then
    if [ "$(remaining)" -le 0 ]; then
      echo "::error::Could not upload the DMG to Apple's notary service before the deadline"
      exit 1
    fi
    backoff "$attempt"
  fi
done

STATUS=""
attempt=0
while :; do
  attempt=$((attempt + 1))
  LEFT=$(remaining)
  if [ "$LEFT" -le 0 ]; then
    echo "::error::No notarization verdict for submission $ID before the deadline (last status: ${STATUS:-none}). Apple may still accept it: notarytool info $ID"
    exit 1
  fi
  echo "=== Waiting on submission $ID (attempt $attempt, ${LEFT}s left) ==="
  notary wait "$ID" --timeout "$LEFT" --output-format json > "$WORK/wait.json" \
    || echo "notarytool wait exited $?"
  cat "$WORK/wait.json"; echo
  STATUS=$(json_field status "$WORK/wait.json")
  case "$STATUS" in
    Accepted) break ;;
    Invalid | Rejected)
      notary log "$ID" || echo "::warning::could not fetch the notary log for $ID"
      echo "::error::Apple returned $STATUS for the DMG; the notary log above names the offending files"
      exit 1
      ;;
  esac
  backoff "$attempt"
done

staple() {
  local n=0
  while [ "$n" -lt "$STAPLE_ATTEMPTS" ]; do
    n=$((n + 1))
    if xcrun stapler staple "$1"; then
      return 0
    fi
    echo "No ticket for $1 yet (attempt $n/$STAPLE_ATTEMPTS)"
    [ "$n" -lt "$STAPLE_ATTEMPTS" ] && sleep "$BASE"
  done
  echo "::error::Could not staple $1: Apple accepted submission $ID but its ticket never became fetchable"
  return 1
}
staple "$DMG"
staple "$APP"
