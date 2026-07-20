#!/bin/sh
# `pnpm dev:staging` — run the desktop app (Tauri) as a CLIENT of a REMOTE
# Houston Cloud STAGING environment.
#
# This is NOT `pnpm dev`. `pnpm dev` boots the entire local stack (Postgres,
# Go gateway, control-plane, local host, web) and the desktop talks to
# localhost. Here NOTHING runs locally except the desktop shell: the gateway,
# the per-agent engines, sign-in and every backend live in the staging cloud.
# It is the production "Houston Cloud desktop" shape (hosted-oauth: real
# sign-in, multiplayer in the window) — just pointed at the staging gateway.
#
# Env model — a SINGLE self-contained, gitignored file (NOT the two-file dev
# contract): .env.staging holds the real staging URLs + credentials. We
# deliberately do NOT source .env.development: it is all-localhost (its
# VITE_NEW_ENGINE_URL=http://127.0.0.1:4318 would pin the desktop to a local
# host that isn't running), so it would fight every staging value.
#
# Required keys (the script fails fast, by name, if any is missing):
#   VITE_CONTROL_PLANE_URL   the staging gateway URL (the hosted engine)
#   FIREBASE_API_KEY         staging GCIP Web API key (Google sign-in)
#   GOOGLE_DESKTOP_CLIENT_ID + GOOGLE_DESKTOP_CLIENT_SECRET   desktop OAuth
# Optional: FIREBASE_PROJECT_ID / FIREBASE_AUTH_DOMAIN (if staging uses its own
# GCIP project), VITE_AGENTSTORE_GATEWAY_URL, MICROSOFT_DESKTOP_CLIENT_ID.
set -eu

ROOT="$(pwd)"
if [ ! -f "$ROOT/.env.staging" ]; then
  echo "✗ .env.staging not found — create it with the staging gateway URL + credentials (see the required keys in this script's header, or ask a teammate)." >&2
  exit 1
fi

set -a
. "$ROOT/.env.staging"
set +a

# The staging gateway URL is the whole point — the hosted engine the desktop
# connects to. Same knob name as the dev loop's cloud profile (app.sh).
if [ -z "${VITE_CONTROL_PLANE_URL:-}" ]; then
  echo "✗ VITE_CONTROL_PLANE_URL is unset in .env.staging — that is the staging gateway the desktop connects to (e.g. https://gateway.staging.gethouston.ai)." >&2
  exit 1
fi
# The hosted cloud shape is gated by sign-in; without the desktop OAuth client
# the auth gate is uncompletable (same rule as app.sh's cloud profile).
if [ -z "${GOOGLE_DESKTOP_CLIENT_ID:-}" ] || [ -z "${GOOGLE_DESKTOP_CLIENT_SECRET:-}" ]; then
  echo "✗ GOOGLE_DESKTOP_CLIENT_ID(+_SECRET) are unset in .env.staging — the hosted desktop is gated by Google sign-in." >&2
  exit 1
fi
if [ -z "${FIREBASE_API_KEY:-}" ]; then
  echo "✗ FIREBASE_API_KEY is unset in .env.staging — needed for the staging GCIP sign-in." >&2
  exit 1
fi

# Wire the desktop into the hosted-oauth transport against staging (see
# app/src/lib/engine-mode.ts):
#   VITE_HOSTED_ENGINE_URL set  → hosted-oauth (the compile-time flag also tells
#                                 the Rust shell to skip the local sidecar).
#   VITE_NEW_ENGINE_URL cleared → so a leftover value can't win static-host over
#                                 the hosted gateway.
export VITE_HOSTED_ENGINE_URL="$VITE_CONTROL_PLANE_URL"
export VITE_NEW_ENGINE_URL= VITE_NEW_ENGINE_TOKEN=
# Agent store follows the same gateway unless .env.staging overrides it.
export VITE_AGENTSTORE_GATEWAY_URL="${VITE_AGENTSTORE_GATEWAY_URL:-$VITE_CONTROL_PLANE_URL}"

echo "→ desktop → staging gateway: $VITE_CONTROL_PLANE_URL"
cd app
exec pnpm tauri dev
