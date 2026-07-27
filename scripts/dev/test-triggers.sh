#!/usr/bin/env bash
# Automated E2E probe for event-driven routines (C9 triggers).
#
# Two modes:
#
#   scripts/dev/test-triggers.sh
#     LOCAL (hermetic, default): spawns a throwaway host from THIS checkout
#     with HOUSTON_MANAGED_CLOUD=1 and a temp data dir, creates an agent and a
#     webhook-trigger routine, POSTs a batch to the internal
#     /agents/:id/trigger-events delivery route (what the control plane calls),
#     and asserts exactly one run fires + the event id dedups on redelivery.
#     No docker, no gcloud, no sign-in. This covers the ENTIRE houston half of
#     triggers (schema, write gate, fire path, dedup lock, prompt framing).
#
#   scripts/dev/test-triggers.sh --staging
#     FULL PIPELINE against the deployed staging gateway: create routine ->
#     mint webhook key -> POST the public hook URL -> assert the run fires.
#     Covers the Go half too (projection, reconciler, ingress, delivery).
#     Auth: TOKEN=<GCIP id token>, else minted from the desktop app's keychain
#     session (refreshed via FIREBASE_API_KEY from env or .env.local).
#
#   GW=<base> overrides the gateway for the full-pipeline mode (e.g. the
#   pnpm-dev gateway http://127.0.0.1:9080 — NOTE: blocked today, dev engines
#   do not store-sync to the control plane so the trigger projection never
#   runs; needs a cpdev fix in the cloud repo).
#
#   Composio-flavor triggers in dev: NEVER set GW_WEBHOOK_PUBLIC_URL locally —
#   the control-plane would re-register the SHARED Composio project's delivery
#   webhook at your laptop and hijack real trigger deliveries. Minted webhook
#   URLs ride GW_HOOKS_PUBLIC_URL / GW_PUBLIC_BASE_URL instead (safe).
#
# Flags: --keep  leave the probe routine/temp dir behind for inspection.
set -euo pipefail

MODE=local
GW="${GW:-}"
KEEP=0
for arg in "$@"; do
  case "$arg" in
    --staging) MODE=gateway; GW="https://staging-gateway.gethouston.ai" ;;
    --keep) KEEP=1 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done
[ -n "$GW" ] && MODE=gateway

say() { printf '\033[1m== %s\033[0m\n' "$*"; }
fail() { printf '\033[31mFAIL: %s\033[0m\n' "$*" >&2; exit 1; }
pass() { printf '\033[32mPASS: %s\033[0m\n' "$*"; }

json_field() { # json_field JSON PY_EXPR   (d = parsed json)
  python3 -c "import json,sys;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$2" <<<"$1"
}
enc() { python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=''))" "$1"; }

# Poll routine_runs until the probe routine has a terminal run (or timeout).
# Prints "STATUS|DETAIL" (empty when no run ever appeared).
wait_for_run() { # wait_for_run BASE RID TRIES CURL_ARGS...
  local base="$1" rid="$2" tries="$3"; shift 3
  local line=""
  for _ in $(seq 1 "$tries"); do
    line="$(curl -sS --max-time 15 "$@" "$base/agents/${AGENT_ENC:-$AGENT}/routine_runs" | python3 -c "
import json,sys
runs=[r for r in json.load(sys.stdin).get('items',[]) if r.get('routine_id')=='$rid']
runs.sort(key=lambda r: r['started_at'])
r=runs[-1] if runs else None
print(f\"{r['status']}|{(r.get('summary') or r.get('error') or '')[:160]}\" if r else '')
" 2>/dev/null || true)"
    [ -n "$line" ] && [ "${line%%|*}" != running ] && break
    sleep 3
  done
  printf '%s' "$line"
}

report_run() { # report_run "STATUS|DETAIL" CONTEXT
  local status="${1%%|*}" detail="${1#*|}"
  say "run: $status — $detail"
  case "$status" in
    surfaced|silent|success|done) pass "$2: trigger fired and the turn completed." ;;
    running) pass "$2: trigger fired a run (turn still running at timeout)." ;;
    error)
      printf '\033[33mPASS (pipeline) / WARN (turn): run fired but errored: %s\033[0m\n' "$detail"
      printf 'Usually no provider is connected for this agent; the trigger pipeline itself worked.\n' ;;
    *) fail "unexpected run status: '$status'" ;;
  esac
}

# ──────────────────────────────────────────────────────────────────────────────
# LOCAL MODE — throwaway host, internal delivery route
# ──────────────────────────────────────────────────────────────────────────────
if [ "$MODE" = local ]; then
  command -v pnpm >/dev/null || fail "pnpm not found"
  REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
  PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')"
  HOME_DIR="$(mktemp -d /tmp/houston-trigger-probe.XXXXXX)"
  TOKEN_LOCAL="trigger-probe-$(date +%s)"
  BASE="http://127.0.0.1:$PORT"
  AUTHH=(-H "Authorization: Bearer $TOKEN_LOCAL")

  # With ANTHROPIC_API_KEY (env or .env.local) the turn completes for real;
  # without it the pipeline still fires and the script reports the expected
  # no-provider outcome. Same credentials.json shape cpdev seeds into pods.
  ANTHROPIC_KEY="${ANTHROPIC_API_KEY:-}"
  if [ -z "$ANTHROPIC_KEY" ]; then
    for f in "$REPO_ROOT/.env.local" "$HOME/dev/houston-main/houston-v1/.env.local"; do
      [ -f "$f" ] && ANTHROPIC_KEY="$(grep -m1 '^ANTHROPIC_API_KEY=' "$f" | cut -d= -f2-)" && [ -n "$ANTHROPIC_KEY" ] && break
    done
  fi
  if [ -n "$ANTHROPIC_KEY" ]; then
    python3 - "$HOME_DIR" "$ANTHROPIC_KEY" <<'PYEOF'
import json, sys
creds = [{"workspaceId": ws, "provider": "anthropic", "accessToken": sys.argv[2],
          "refreshToken": "", "expiresAt": 0, "kind": "api_key"}
         for ws in ("Houston", "Personal")]
open(f"{sys.argv[1]}/credentials.json", "w").write(json.dumps(creds))
PYEOF
    say "seeded anthropic api key (turn will run for real)"
  fi

  say "spawning throwaway host on :$PORT (data: $HOME_DIR)"
  HOUSTON_MANAGED_CLOUD=1 HOUSTON_HOST_PORT="$PORT" HOUSTON_HOST_TOKEN="$TOKEN_LOCAL" \
    HOUSTON_HOME="$HOME_DIR" \
    pnpm --dir "$REPO_ROOT" --filter @houston/host dev >"$HOME_DIR/host.log" 2>&1 &
  HOST_PID=$!
  cleanup_local() {
    # No setsid on macOS: the & child shares our process group, so never kill
    # the group — kill the pnpm wrapper, then whoever still holds the port.
    kill "$HOST_PID" 2>/dev/null || true
    lsof -ti "tcp:$PORT" 2>/dev/null | xargs kill 2>/dev/null || true
    if [ "$KEEP" = 0 ]; then rm -rf "$HOME_DIR"; else say "kept: $HOME_DIR"; fi
  }
  trap cleanup_local EXIT

  for _ in $(seq 1 60); do
    curl -s -o /dev/null --max-time 2 "${AUTHH[@]}" "$BASE/agents" && break
    kill -0 "$HOST_PID" 2>/dev/null || { tail -20 "$HOME_DIR/host.log" >&2; fail "host exited during boot"; }
    sleep 1
  done
  curl -s -o /dev/null --max-time 2 "${AUTHH[@]}" "$BASE/agents" || fail "host never came up on :$PORT"

  AGENT_JSON="$(curl -sS -X POST "${AUTHH[@]}" -H 'Content-Type: application/json' \
    -d '{"name":"Trigger Probe"}' "$BASE/agents")"
  AGENT="$(json_field "$AGENT_JSON" "d.get('id','')")"
  [ -n "$AGENT" ] || fail "agent create failed: $(head -c 200 <<<"$AGENT_JSON")"
  AGENT_ENC="$(enc "$AGENT")"
  say "agent: $AGENT"

  ROUTINE_JSON="$(curl -sS -X POST "${AUTHH[@]}" -H 'Content-Type: application/json' \
    -d '{"name":"trigger-probe","prompt":"Automated trigger verification. Reply with exactly: TRIGGER-OK plus a one-line summary of the event payload. Do nothing else.","trigger":{"kind":"webhook"},"enabled":true,"suppress_when_silent":false,"chat_mode":"per_run"}' \
    "$BASE/agents/$AGENT_ENC/routines")"
  RID="$(json_field "$ROUTINE_JSON" "d.get('id','')")"
  [ -n "$RID" ] || fail "trigger routine rejected: $(head -c 300 <<<"$ROUTINE_JSON")"
  say "routine: $RID"

  EVENT_ID="evt-$(date +%s)"
  DELIVER="$(curl -sS -X POST "${AUTHH[@]}" -H 'Content-Type: application/json' \
    -d "{\"events\":[{\"id\":\"$EVENT_ID\",\"routine_id\":\"$RID\",\"trigger_slug\":\"INCOMING_WEBHOOK\",\"payload\":{\"source\":\"test-triggers.sh\"}}]}" \
    "$BASE/agents/$AGENT_ENC/trigger-events")"
  RESULT="$(json_field "$DELIVER" "d.get('result','')")"
  if [ "$RESULT" != fired ]; then
    if grep -q no_provider <<<"$DELIVER"; then
      printf '\033[33mPASS (pipeline) / WARN (turn): delivery reached the fire path but no provider is connected.\033[0m\n'
      printf 'Set ANTHROPIC_API_KEY (env or .env.local) to make the turn run for real.\n'
      exit 0
    fi
    fail "delivery result '$RESULT' (want fired): $(head -c 200 <<<"$DELIVER")"
  fi
  say "delivery: fired"

  # Redelivery of the SAME event id must dedup — no second run for this event.
  REDELIVER="$(curl -sS -X POST "${AUTHH[@]}" -H 'Content-Type: application/json' \
    -d "{\"events\":[{\"id\":\"$EVENT_ID\",\"routine_id\":\"$RID\",\"trigger_slug\":\"INCOMING_WEBHOOK\",\"payload\":{}}]}" \
    "$BASE/agents/$AGENT_ENC/trigger-events")"
  RERESULT="$(json_field "$REDELIVER" "d.get('result','')")"
  say "redelivery of the same event id: $RERESULT (deduped, no new run expected)"

  RUN_LINE="$(wait_for_run "$BASE" "$RID" 40 "${AUTHH[@]}")"
  [ -n "$RUN_LINE" ] || fail "no routine run recorded after a fired delivery"
  N_RUNS="$(curl -sS "${AUTHH[@]}" "$BASE/agents/$AGENT_ENC/routine_runs" | python3 -c "
import json,sys;print(len([r for r in json.load(sys.stdin).get('items',[]) if r.get('routine_id')=='$RID']))")"
  [ "$N_RUNS" = 1 ] || fail "expected exactly 1 run after dedup, found $N_RUNS"
  report_run "$RUN_LINE" "local engine half"
  exit 0
fi

# ──────────────────────────────────────────────────────────────────────────────
# GATEWAY MODE — full pipeline (staging, or GW= override)
# ──────────────────────────────────────────────────────────────────────────────
find_api_key() {
  [ -n "${FIREBASE_API_KEY:-}" ] && { echo "$FIREBASE_API_KEY"; return; }
  for f in "$(dirname "$0")/../../.env.local" "$HOME/dev/houston-main/houston-v1/.env.local"; do
    [ -f "$f" ] && grep -m1 '^FIREBASE_API_KEY=' "$f" | cut -d= -f2- && return
  done
  true
}

if [ -z "${TOKEN:-}" ]; then
  say "minting GCIP token from the keychain session"
  SESSION_HEX="$(security find-generic-password -s com.houston.app.auth -a houston-auth -w 2>/dev/null)" \
    || fail "no TOKEN and no keychain session (sign in to the desktop app once, or pass TOKEN=)"
  API_KEY="$(find_api_key)"
  TOKEN="$(SESSION_HEX="$SESSION_HEX" API_KEY="$API_KEY" python3 - <<'PY'
import json, os, sys, time, base64, urllib.request

s = json.loads(bytes.fromhex(os.environ["SESSION_HEX"]).decode())
tok = s.get("idToken", "")

def exp_in(t):
    try:
        p = json.loads(base64.urlsafe_b64decode(t.split(".")[1] + "=="))
        return p["exp"] - time.time()
    except Exception:
        return -1

if exp_in(tok) > 120:
    print(tok); sys.exit()

key = os.environ.get("API_KEY", "")
if not key:
    sys.stderr.write("keychain idToken expired and FIREBASE_API_KEY unavailable for refresh\n")
    sys.exit(1)
body = f"grant_type=refresh_token&refresh_token={s['refreshToken']}".encode()
req = urllib.request.Request(
    f"https://securetoken.googleapis.com/v1/token?key={key}",
    data=body, headers={"Content-Type": "application/x-www-form-urlencoded"})
with urllib.request.urlopen(req) as r:
    print(json.load(r)["id_token"])
PY
)" || fail "could not obtain a GCIP token"
fi
AUTHH=(-H "Authorization: Bearer $TOKEN")

api() { # api METHOD PATH [JSON_BODY]  (never hard-fails; callers inspect output)
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS --max-time 30 -X "$method" "${AUTHH[@]}" -H 'Content-Type: application/json' -d "$body" "$GW$path" 2>/dev/null || true
  else
    curl -sS --max-time 30 -X "$method" "${AUTHH[@]}" "$GW$path" 2>/dev/null || true
  fi
}

say "gateway: $GW"
AGENTS_JSON="$(api GET /agents)"
case "$AGENTS_JSON" in
  \[*) ;;
  *) fail "unexpected /agents reply (gateway down? auth?): $(head -c 200 <<<"$AGENTS_JSON")" ;;
esac
if [ -z "${AGENT:-}" ]; then
  AGENT="$(json_field "$AGENTS_JSON" "d[0]['id'] if d else ''")"
fi
if [ -z "$AGENT" ]; then
  say "no agents — creating one (first engine boot can take a minute)"
  AGENT="$(api POST /agents '{"name":"Trigger Probe"}' | python3 -c 'import json,sys;print(json.load(sys.stdin).get("id",""))')"
  [ -n "$AGENT" ] || fail "agent create failed"
fi
say "agent: $AGENT"

STAMP="$(date +%s)"
CREATE_BODY="$(printf '{"name":"trigger-probe-%s","prompt":"Automated webhook-trigger verification. Reply with exactly: TRIGGER-OK plus a one-line summary of the event payload you received. Do not take any other action.","trigger":{"kind":"webhook"},"enabled":true,"suppress_when_silent":false,"chat_mode":"per_run"}' "$STAMP")"
ROUTINE_JSON="$(api POST "/agents/$AGENT/routines" "$CREATE_BODY")"
RID="$(json_field "$ROUTINE_JSON" "d.get('id','')")"
[ -n "$RID" ] || fail "routine create rejected: $(head -c 300 <<<"$ROUTINE_JSON")"
say "routine: $RID"

cleanup_gw() {
  if [ "$KEEP" = 0 ]; then
    api DELETE "/agents/$AGENT/routines/$RID" >/dev/null || true
    say "probe routine deleted (pass --keep to retain)"
  fi
}
trap cleanup_gw EXIT

# The mint needs the routine's desired binding PROJECTED at the gateway, which
# rides the pod's debounced store sync — retry until it lands.
say "minting the webhook key (waits for the pod->gateway sync, <=90s)"
HOOK_URL=""
MINT_JSON=""
for _ in $(seq 1 30); do
  MINT_JSON="$(api POST "/v1/agents/$AGENT/routines/$RID/webhook-key")"
  HOOK_URL="$(json_field "$MINT_JSON" "d.get('url','')" 2>/dev/null || true)"
  [ -n "$HOOK_URL" ] && break
  sleep 3
done
[ -n "$HOOK_URL" ] || fail "webhook-key mint failed: $(head -c 300 <<<"$MINT_JSON") (503 = the gateway has no public base for hooks (GW_HOOKS_PUBLIC_URL/GW_PUBLIC_BASE_URL); 'no webhook automation' = the routine never synced/projected — on the pnpm-dev stack this is the known cpdev store-sync gap)"
say "minted: ${HOOK_URL%/*}/<secret>"

say "waiting for trigger-status: active (reconciler sweep, <=90s)"
STATUS=""
for _ in $(seq 1 30); do
  STATUS="$(api GET "/v1/agents/$AGENT/trigger-status" \
    | python3 -c "import json,sys;print(next((i['status'] for i in json.load(sys.stdin).get('items',[]) if i['routine_id']=='$RID'),''))" 2>/dev/null || true)"
  [ "$STATUS" = active ] && break
  sleep 3
done
[ "$STATUS" = active ] || fail "binding never went active (last: '${STATUS:-none}')"
say "trigger-status: active"

ACCEPT="$(curl -sS --max-time 30 -X POST -H 'Content-Type: application/json' \
  -H "X-Idempotency-Key: probe-$STAMP" \
  -d "{\"source\":\"test-triggers.sh\",\"stamp\":\"$STAMP\"}" "$HOOK_URL")"
grep -q accepted <<<"$ACCEPT" || fail "hook POST not accepted: $(head -c 200 <<<"$ACCEPT")"
say "event accepted — waiting for the routine run (<=120s)"

RUN_LINE="$(wait_for_run "$GW" "$RID" 40 "${AUTHH[@]}")"
[ -n "$RUN_LINE" ] || fail "no routine run appeared — the delivery loop never fired the pod route"
report_run "$RUN_LINE" "full pipeline"
