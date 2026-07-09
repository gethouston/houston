#!/usr/bin/env bash
# pnpm dev:cloud — one-command LOCAL hosted-cloud loop to test C8 (Spaces /
# multiplayer) as production runs it: a kind cluster + the gateway (from sibling
# cloud/) + engine pods (from THIS checkout) + the web app on real Supabase.
# ALL cluster/gateway logic is delegated to cloud/Makefile; this only preflights,
# keeps both Supabase refs in lockstep, flips PVs to Retain (agent moves),
# health-checks the gateway, and runs the web dev server.
#   pnpm dev:cloud [--check] | dev:cloud:retain | dev:cloud:down
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOUSTON_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# Sibling `cloud` next to the houston repo root — works in ~/dev-houston and in
# the _agent-tasks/<id>/ worktrees alike. Override with CLOUD_DIR=.
CLOUD_DIR="${CLOUD_DIR:-$(cd "$HOUSTON_ROOT/.." && pwd)/cloud}"

CLUSTER="houston-gateway"
KUBECTL="kubectl --context kind-${CLUSTER}"
GW_URL="${GW_URL:-http://localhost:9080}"
WEB_PORT="1430"
ENV_FILE="$HOUSTON_ROOT/.env.local"
# Engine pods are built from THIS houston checkout by default (faithful C8 test).
# Override ENGINE_IMAGE_SOURCE=registry for a faster smoke on the published image.
ENGINE_IMAGE_SOURCE="${ENGINE_IMAGE_SOURCE:-local}"

b() { printf '\033[1m%s\033[0m' "$1"; }
info() { printf '  %s\n' "$1"; }
step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

MODE="up"
FRONTEND="web"
case "${1:-}" in
  --check)  MODE="check" ;;
  --down)   MODE="down" ;;
  --retain) MODE="retain" ;;
  --app)    FRONTEND="app" ;;
  "")       MODE="up" ;;
  *) die "unknown flag '$1' (use --check | --down | --retain | --app)" ;;
esac

# Config resolution: shell env wins, else the repo-convention .env.local.
from_env_file() { # $1=KEY — reads an uncommented KEY=value from .env.local
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^${1}=" "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '"'
}
: "${SUPABASE_URL:=$(from_env_file SUPABASE_URL)}"
: "${SUPABASE_ANON_KEY:=$(from_env_file SUPABASE_ANON_KEY)}"
: "${ANTHROPIC_API_KEY:=$(from_env_file ANTHROPIC_API_KEY)}"

# Preflight: each concern its own check; collect ALL failures, then abort.
FAILS=()
add_fail() { FAILS+=("$1"); }

preflight() {
  [ -f "$CLOUD_DIR/Makefile" ] || add_fail "cloud repo not found at $(b "$CLOUD_DIR"). Clone gethouston/cloud beside this houston checkout, or set CLOUD_DIR=/path/to/cloud and re-run."
  if ! command -v docker >/dev/null 2>&1; then
    add_fail "docker not installed. Install Docker Desktop: https://www.docker.com/products/docker-desktop"
  elif ! docker info >/dev/null 2>&1; then
    add_fail "Docker is installed but the daemon is not reachable. $(b 'Start Docker Desktop, then re-run')."
  fi
  command -v kind    >/dev/null 2>&1 || add_fail "kind not installed.    $(b 'brew install kind')"
  command -v kubectl >/dev/null 2>&1 || add_fail "kubectl not installed. $(b 'brew install kubectl')"
  command -v jq      >/dev/null 2>&1 || add_fail "jq not installed (cloud/Makefile needs it). $(b 'brew install jq')"
  command -v make    >/dev/null 2>&1 || add_fail "make not installed (Xcode CLT). $(b 'xcode-select --install')"
  # Gateway verifies JWTs from the SAME Supabase project the web signs into; we
  # derive SUPABASE_PROJECT from this URL so both sides match (INTEGRATION.md).
  if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
    add_fail "Supabase not configured. $(b 'cp .env.example .env.local'), then set $(b SUPABASE_URL) + $(b SUPABASE_ANON_KEY) to the SAME project the gateway verifies against (recipe: knowledge-base/auth.md). Mismatch = sign-in works but every request 401s."
  fi
  if [ ${#FAILS[@]} -gt 0 ]; then
    printf '\n\033[31mPreflight found %d issue(s):\033[0m\n' "${#FAILS[@]}" >&2
    for f in "${FAILS[@]}"; do printf '\n  \033[31m✗\033[0m %s\n' "$f" >&2; done
    printf '\nFix the above and re-run %s.\n' "$(b 'pnpm dev:cloud')" >&2
    exit 1
  fi
}

# Gateway's Supabase project ref, derived from the web URL (keeps both on ONE
# project — the mismatch footgun in k8s/kind/README.md).
supabase_ref() { local r="${SUPABASE_URL#https://}"; printf '%s' "${r%%.*}"; }

# Flip every gateway-managed agent PV to Retain so POST /v1/agents/:slug/move
# clears its non-Retain preflight (kind's default StorageClass is Delete; see
# k8s/kind/README.md "PV Retain caveat"). Idempotent; safe when zero agents.
retain_pvs() {
  local ns pv patched=0
  for ns in $($KUBECTL get ns -l app.kubernetes.io/managed-by=houston-gateway \
                -o jsonpath='{.items[*].metadata.name}' 2>/dev/null); do
    for pv in $($KUBECTL -n "$ns" get pvc -o jsonpath='{.items[*].spec.volumeName}' 2>/dev/null); do
      [ -n "$pv" ] || continue
      $KUBECTL patch pv "$pv" -p '{"spec":{"persistentVolumeReclaimPolicy":"Retain"}}' >/dev/null 2>&1 && patched=$((patched+1))
    done
  done
  info "PVs set to Retain (agent moves enabled): $patched"
}

wait_for_gateway() { # bounded wait on the gateway health route via kind ingress
  step "Health-checking the gateway at $GW_URL"
  for _ in $(seq 1 60); do
    if curl -fsS "$GW_URL/health" >/dev/null 2>&1; then info "gateway healthy ✓"; return 0; fi
    sleep 2
  done
  die "gateway did not answer $GW_URL/health within 120s. Inspect: make -C \"$CLOUD_DIR\" kind-logs"
}

walkthrough() {
  cat <<EOF

$(b '── Local hosted cloud is UP — test the C8 Spaces / multiplayer flow ──')
  Gateway $GW_URL (Supabase $(supabase_ref)) · Web http://localhost:$WEB_PORT (real sign-in)
  Engine  pods built from THIS checkout (ENGINE_IMAGE_SOURCE=$ENGINE_IMAGE_SOURCE)

  $(b 'THE C8 JOURNEY') — two real Google accounts, A and B:
   1. Open http://localhost:$WEB_PORT and sign in as $(b 'user A').
   2. In $(b Personal), create an agent (first create provisions its pod; a cold
      boot takes a few minutes — watch: make -C cloud kind-engines).
   3. Agent's $(b Share) dialog → $(b 'create a team') → the agent MOVES into it.
      Blocked with 409 unmovable_volume? Run $(b 'pnpm dev:cloud:retain'), then retry.
   4. Invite $(b "user B")'s email (role: member).
   5. Incognito window → sign in as $(b 'user B') → accept the invite from the
      $(b 'space switcher') (top-left workspace picker).
   6. Both chat in the shared agent; check the $(b 'mission board') (face stacks +
      $(b 'person filter')) and the $(b 'org dashboard').

  Turns need a provider: export ANTHROPIC_API_KEY (seeds every pod) or connect one
  in-app per agent (Reconnect your AI).
  Billing is OFF (no GW_STRIPE_* keys) — teams are free multiplayer orgs. Seats/
  trial: cloud/docs/deploy-C8.md §Stage 2.
  $(b Stop): pnpm dev:cloud:down. The web server runs below — Ctrl-C stops just it.

EOF
}

if [ "$MODE" = "down" ]; then
  step "Tearing down the local hosted cloud"
  if command -v make >/dev/null 2>&1 && [ -f "$CLOUD_DIR/Makefile" ]; then
    make -C "$CLOUD_DIR" kind-down || true
  fi
  if pids="$(lsof -ti "tcp:$WEB_PORT" 2>/dev/null)" && [ -n "$pids" ]; then # web dev server on :WEB_PORT
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    info "stopped the web server on :$WEB_PORT"
  fi
  info "done. Cluster and web server are down."
  exit 0
fi

preflight   # collects+aborts on any failure; docker-missing here IS the message
if [ "$MODE" = "check" ]; then
  step "Preflight passed — here is what 'pnpm dev:cloud' would do"
  info "cloud checkout   : $CLOUD_DIR"
  info "supabase project : $(supabase_ref)  (gateway + web pinned to this ref)"
  info "engine image     : ENGINE_IMAGE_SOURCE=$ENGINE_IMAGE_SOURCE (pods from $HOUSTON_ROOT)"
  info "anthropic key    : $([ -n "${ANTHROPIC_API_KEY:-}" ] && echo 'set (seeded into pods)' || echo 'unset (connect a provider in-app)')"
  info "1. make -C cloud kind-up ENGINE_IMAGE_SOURCE=$ENGINE_IMAGE_SOURCE HOUSTON_WEB_DIR=$HOUSTON_ROOT SUPABASE_PROJECT=$(supabase_ref)"
  info "   (existing cluster → also: make -C cloud kind-engines-recreate  to roll pods to the rebuilt engine image)"
  info "2. flip agent PVs to Retain (enables agent moves on kind)"
  info "3. wait for $GW_URL/health"
  info "4. run the web app: VITE_CONTROL_PLANE_URL=$GW_URL pnpm --filter houston-web dev  (→ :$WEB_PORT)"
  exit 0
fi
if [ "$MODE" = "retain" ]; then
  step "Flipping agent PVs to Retain"
  retain_pvs
  exit 0
fi

REF="$(supabase_ref)"
CLUSTER_EXISTED=0
kind get clusters 2>/dev/null | grep -qx "$CLUSTER" && CLUSTER_EXISTED=1

step "Bringing up the gateway on kind (delegating to cloud/Makefile)"
info "SUPABASE_PROJECT=$REF · ENGINE_IMAGE_SOURCE=$ENGINE_IMAGE_SOURCE · HOUSTON_WEB_DIR=$HOUSTON_ROOT"
# kind-up self-guards each sub-target and always rebuilds+reloads images (a re-run
# picks up code changes); ANTHROPIC_API_KEY rides through to kind-seed-key.
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
  make -C "$CLOUD_DIR" kind-up \
    ENGINE_IMAGE_SOURCE="$ENGINE_IMAGE_SOURCE" \
    HOUSTON_WEB_DIR="$HOUSTON_ROOT" \
    SUPABASE_PROJECT="$REF" \
    GW_URL="$GW_URL"
if [ "$CLUSTER_EXISTED" = "1" ] && [ "$ENGINE_IMAGE_SOURCE" = "local" ]; then
  step "Rolling existing agent pods to the freshly built engine image"
  make -C "$CLOUD_DIR" kind-engines-recreate ENGINE_IMAGE_SOURCE="$ENGINE_IMAGE_SOURCE" || true
fi
step "Enabling agent moves (PV Retain patch)"
retain_pvs
wait_for_gateway
walkthrough

if [ "$FRONTEND" = "app" ]; then
  step "Starting the DESKTOP app against the local gateway (Supabase sign-in) — Ctrl-C to stop"
  # Hosted-oauth desktop mode: the presence of VITE_HOSTED_ENGINE_URL flips the
  # Tauri shell to Supabase Google login against the gateway (engine-mode.ts —
  # hosted URL implies oauth); VITE_NEW_ENGINE_URL/TOKEN are cleared so the
  # static-token dev path can't shadow it. One desktop instance = one signed-in
  # user; run user B in an incognito tab of the web frontend (same UI codebase).
  exec env \
    VITE_HOSTED_ENGINE_URL="$GW_URL" \
    VITE_NEW_ENGINE_URL= \
    VITE_NEW_ENGINE_TOKEN= \
    SUPABASE_URL="$SUPABASE_URL" \
    SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
    pnpm --dir "$HOUSTON_ROOT/app" tauri dev
fi

step "Starting the web app (Supabase sign-in) — Ctrl-C to stop"
# Supabase-JWT hosted web mode: VITE_CONTROL_PLANE_URL mounts CloudApp (real
# sign-in), SUPABASE_* bake into the app's Supabase client, and VITE_CP_DEV_TOKEN
# is deliberately unset so the browser uses the live session (web main.tsx +
# cloud-login.tsx). Foreground; logs stream here.
exec env \
  VITE_CONTROL_PLANE_URL="$GW_URL" \
  SUPABASE_URL="$SUPABASE_URL" \
  SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  pnpm --dir "$HOUSTON_ROOT" --filter houston-web dev
