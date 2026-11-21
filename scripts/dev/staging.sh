#!/bin/sh
set -eu

ROOT="$(pwd)"
if [ ! -f "$ROOT/.env.staging" ]; then
  echo "✗ .env.staging not found — create it with the staging gateway URL + credentials (see the required keys in this script's header, or ask a teammate)." >&2
  exit 1
fi

set -a
. "$ROOT/.env.staging"
set +a

if [ -z "${VITE_CONTROL_PLANE_URL:-}" ]; then
  echo "✗ VITE_CONTROL_PLANE_URL is unset in .env.staging — that is the staging gateway the desktop connects to (e.g. https://gateway.staging.gethouston.ai)." >&2
  exit 1
fi
if [ -z "${GOOGLE_DESKTOP_CLIENT_ID:-}" ] || [ -z "${GOOGLE_DESKTOP_CLIENT_SECRET:-}" ]; then
  echo "✗ GOOGLE_DESKTOP_CLIENT_ID(+_SECRET) are unset in .env.staging — the hosted desktop is gated by Google sign-in." >&2
  exit 1
fi
if [ -z "${FIREBASE_API_KEY:-}" ]; then
  echo "✗ FIREBASE_API_KEY is unset in .env.staging — needed for the staging GCIP sign-in." >&2
  exit 1
fi

export VITE_HOSTED_ENGINE_URL="$VITE_CONTROL_PLANE_URL"
export VITE_NEW_ENGINE_URL= VITE_NEW_ENGINE_TOKEN=
export VITE_AGENTSTORE_GATEWAY_URL="${VITE_AGENTSTORE_GATEWAY_URL:-$VITE_CONTROL_PLANE_URL}"

REPO_VERSION="$(node -p "require('$ROOT/app/package.json').version" 2>/dev/null || echo "")"

echo "→ desktop → staging gateway: $VITE_CONTROL_PLANE_URL  (as ${REPO_VERSION:-?}+cloud)"
cd app
exec pnpm tauri dev
