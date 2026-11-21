#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$ROOT/scripts/ci/stamp-train-label.sh"
WRITE="$ROOT/scripts/ci/write-train-json.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass=0 fail=0
ok()  { printf '  ok   %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf '  FAIL %s\n' "$1"; fail=$((fail + 1)); }
assert_str() {
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi
}
assert_contains() {
  case "$2" in *"$3"*) ok "$1" ;; *) bad "$1 (no '$3' in: $2)" ;; esac
}
output_value() {
  grep "^$2=" "$1" | tail -n 1 | cut -d= -f2-
}

make_repo() {
  local bare="$TMP/$1.git" work="$TMP/$1"
  git init -q --bare "$bare"
  git init -q "$work"
  git -C "$work" config user.name test
  git -C "$work" config user.email test@example.com
  git -C "$work" commit -q --allow-empty -m "image commit"
  git -C "$work" commit -q --allow-empty -m "workflow change"
  git -C "$work" remote add origin "$bare"
  git -C "$work" push -q origin HEAD:refs/heads/main
}

run_stamp() {
  ( cd "$1" && GITHUB_OUTPUT="$2" bash "$STAMP" "$3" "$4" "train 9.9.9 label" ) 2>&1
}

echo "== stamp-train-label.sh =="

make_repo fresh
OLD=$(git -C "$TMP/fresh" rev-parse HEAD~1)
: > "$TMP/fresh.out"
if LOG=$(run_stamp "$TMP/fresh" "$TMP/fresh.out" label/agentstore-v9.9.9 "$OLD"); then
  ok "fresh label exits 0"
else
  bad "fresh label exited non-zero: $LOG"
fi
assert_str "fresh label stamped=true" "$(output_value "$TMP/fresh.out" stamped)" true
assert_str "fresh label points at the image commit on the remote" \
  "$(git -C "$TMP/fresh.git" rev-parse 'refs/tags/label/agentstore-v9.9.9^{commit}')" "$OLD"
assert_contains "fresh label notice" "$LOG" "::notice::Stamped label/agentstore-v9.9.9"

: > "$TMP/fresh-again.out"
if LOG=$(run_stamp "$TMP/fresh" "$TMP/fresh-again.out" label/agentstore-v9.9.9 "$OLD"); then
  ok "re-publish exits 0"
else
  bad "re-publish exited non-zero: $LOG"
fi
assert_str "re-publish stamped=unchanged" "$(output_value "$TMP/fresh-again.out" stamped)" unchanged

NEW=$(git -C "$TMP/fresh" rev-parse HEAD)
: > "$TMP/moved.out"
if LOG=$(run_stamp "$TMP/fresh" "$TMP/moved.out" label/agentstore-v9.9.9 "$NEW"); then
  ok "moved label exits 0"
else
  bad "moved label exited non-zero: $LOG"
fi
assert_str "moved label stamped=false" "$(output_value "$TMP/moved.out" stamped)" false
assert_contains "moved label is an ::error:: annotation (drift or squat)" "$LOG" "::error::"
assert_contains "moved label names both commits" "$(output_value "$TMP/moved.out" reason)" "$OLD"
assert_str "moved label left untouched on the remote" \
  "$(git -C "$TMP/fresh.git" rev-parse 'refs/tags/label/agentstore-v9.9.9^{commit}')" "$OLD"

make_repo refused
cat > "$TMP/refused.git/hooks/pre-receive" <<'EOF'
#!/usr/bin/env bash
printf 'refusing to allow a GitHub App to create or update workflow .github/workflows/ci.yml without workflows permission (100%% sure)\r\n' >&2
exit 1
EOF
chmod +x "$TMP/refused.git/hooks/pre-receive"
OLD=$(git -C "$TMP/refused" rev-parse HEAD~1)
: > "$TMP/refused.out"
if LOG=$(run_stamp "$TMP/refused" "$TMP/refused.out" label/agentstore-v9.9.9 "$OLD"); then
  ok "refused push exits 0"
else
  bad "refused push exited non-zero: $LOG"
fi
assert_str "refused push stamped=false" "$(output_value "$TMP/refused.out" stamped)" false
assert_contains "refused push warns with the remote's reason" "$LOG" \
  "::warning::label/agentstore-v9.9.9 not stamped at ${OLD}: "
assert_contains "refused push reason carries the remote message" \
  "$(output_value "$TMP/refused.out" reason)" "without workflows permission"
assert_contains "stored reason keeps % raw" "$(output_value "$TMP/refused.out" reason)" "(100% sure)"
assert_str "stored reason has no %25 escape" \
  "$(grep -c '%25' "$TMP/refused.out" || true)" 0
assert_str "stored outputs are two lines, no CR (stamped= and reason=)" \
  "$(tr -d -c '\n' < "$TMP/refused.out" | wc -c | tr -d ' '):$(grep -c $'\r' "$TMP/refused.out" || true)" "2:0"
assert_contains "annotation escapes % for GitHub" "$LOG" "(100%25 sure)"
if git -C "$TMP/refused.git" rev-parse -q --verify refs/tags/label/agentstore-v9.9.9 >/dev/null; then
  bad "refused push left a tag on the remote"
else
  ok "refused push left no tag on the remote"
fi
if git -C "$TMP/refused" rev-parse -q --verify refs/tags/label/agentstore-v9.9.9 >/dev/null; then
  bad "refused push left the local tag behind"
else
  ok "refused push removed the local tag"
fi

if bash "$STAMP" only-one-arg >/dev/null 2>&1; then
  bad "usage error accepted"
else
  ok "usage error rejected"
fi

echo
echo "== write-train-json.sh =="

export TAG=cloud-v9.9.9 VERSION=9.9.9 REGISTRY=us-east1-docker.pkg.dev/acme/houston
export BASE_SHA=1111111111111111111111111111111111111111
export RUN_URL=https://github.com/acme/houston/actions/runs/1
export ENGINE_SHA=2222222222222222222222222222222222222222 ENGINE_DIGEST=sha256:aaaa
export ENGINE_DISPATCHED=true ENGINE_LABEL_STAMPED=true ENGINE_LABEL_REASON=pushed
export AGENTSTORE_SHA=3333333333333333333333333333333333333333 AGENTSTORE_DIGEST=sha256:bbbb
export AGENTSTORE_DISPATCHED=true AGENTSTORE_LABEL_STAMPED=false
export AGENTSTORE_LABEL_REASON="refusing to allow a GitHub App to create or update workflow"

bash "$WRITE" "$TMP/train.json"
assert_str "schema" "$(jq -r .schema "$TMP/train.json")" 1
assert_str "tag" "$(jq -r .tag "$TMP/train.json")" cloud-v9.9.9
assert_str "version" "$(jq -r .version "$TMP/train.json")" 9.9.9
assert_str "base sha" "$(jq -r .base_sha "$TMP/train.json")" "$BASE_SHA"
assert_str "run url" "$(jq -r .run_url "$TMP/train.json")" "$RUN_URL"
assert_str "engine sha" "$(jq -r .engine.sha "$TMP/train.json")" "$ENGINE_SHA"
assert_str "engine image" "$(jq -r .engine.image "$TMP/train.json")" "$REGISTRY/engine-pod@sha256:aaaa"
assert_str "engine dispatched" "$(jq -r .engine.dispatched "$TMP/train.json")" true
assert_str "engine label name" "$(jq -r .engine.label.name "$TMP/train.json")" label/engine-pod-v9.9.9
assert_str "engine label stamped" "$(jq -r .engine.label.stamped "$TMP/train.json")" true
assert_str "agentstore image" "$(jq -r .agentstore.image "$TMP/train.json")" "$REGISTRY/agentstore@sha256:bbbb"
assert_str "agentstore label name" "$(jq -r .agentstore.label.name "$TMP/train.json")" label/agentstore-v9.9.9
assert_str "agentstore label stamped" "$(jq -r .agentstore.label.stamped "$TMP/train.json")" false
assert_str "agentstore label reason" "$(jq -r .agentstore.label.reason "$TMP/train.json")" "$AGENTSTORE_LABEL_REASON"
assert_str "recorded_at is UTC ISO-8601" \
  "$(jq -r .recorded_at "$TMP/train.json" | grep -cE '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$')" 1

AGENTSTORE_DISPATCHED='' AGENTSTORE_LABEL_STAMPED='' AGENTSTORE_LABEL_REASON='' \
  bash "$WRITE" "$TMP/train-undispatched.json"
assert_str "undispatched half keeps its resolved image" \
  "$(jq -r .agentstore.sha "$TMP/train-undispatched.json")" "$AGENTSTORE_SHA"
assert_str "undispatched half reads dispatched=false" \
  "$(jq -r .agentstore.dispatched "$TMP/train-undispatched.json")" false
assert_str "a non-true dispatched value is false" \
  "$(AGENTSTORE_DISPATCHED=yes bash "$WRITE" "$TMP/train-yes.json" && jq -r .agentstore.dispatched "$TMP/train-yes.json")" false

ENGINE_LABEL_STAMPED=unchanged bash "$WRITE" "$TMP/train-unchanged.json"
assert_str "unchanged label counts as stamped" "$(jq -r .engine.label.stamped "$TMP/train-unchanged.json")" true

AGENTSTORE_SHA='' AGENTSTORE_DIGEST='' AGENTSTORE_DISPATCHED='' AGENTSTORE_LABEL_STAMPED='' \
  AGENTSTORE_LABEL_REASON='' bash "$WRITE" "$TMP/train-half.json"
assert_str "unresolved agentstore half is null" "$(jq -r .agentstore "$TMP/train-half.json")" null
assert_str "engine half survives" "$(jq -r .engine.digest "$TMP/train-half.json")" sha256:aaaa
assert_str "empty base sha is null" \
  "$(BASE_SHA='' bash "$WRITE" "$TMP/train-nobase.json" && jq -r .base_sha "$TMP/train-nobase.json")" null

if TAG='' bash "$WRITE" "$TMP/train-bad.json" >/dev/null 2>&1; then
  bad "empty TAG accepted"
else
  ok "empty TAG rejected"
fi

echo
printf 'PASS %d  FAIL %d\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
