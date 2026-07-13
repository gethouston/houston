#!/bin/sh
# `pnpm dev` pane: the desktop app (Tauri). TWO selectable engines — one
# window can only speak to one engine, so the profile is a per-developer knob
# (DEV_DESKTOP_PROFILE in .env.local; the doctor matrix prints the active one):
#
#   local (default)  engine = the host pane (:4318). The LOCAL profile:
#                    terminal, reveal-in-OS, dictation, local models — the
#                    only pane that exercises it. Single-player by nature
#                    (teams live in the gateway, not on your laptop).
#   cloud            engine = the local gateway (:9080), hosted-oauth mode —
#                    the "Houston Cloud desktop" production shape: real
#                    sign-in, MULTIPLAYER in the desktop window. While here,
#                    the local profile isn't exercised (the web pane still
#                    covers the cloud UI for a second user via incognito).
#
# Desktop LOGIN/LOGOUT are real (Google loopback+PKCE → GCIP, Keychain
# session, sign-out in Settings → Account) when GOOGLE_DESKTOP_CLIENT_ID(+
# _SECRET) are in .env.local. Without them the local profile blanks
# FIREBASE_API_KEY so the auth gate never mounts (it would be uncompletable),
# and the cloud profile refuses to start (it REQUIRES sign-in).
set -eu
. scripts/dev/env.sh

cd app
case "${DEV_DESKTOP_PROFILE:-local}" in
  cloud)
    if [ -z "${GOOGLE_DESKTOP_CLIENT_ID:-}" ]; then
      echo "✗ DEV_DESKTOP_PROFILE=cloud needs GOOGLE_DESKTOP_CLIENT_ID(+_SECRET) in .env.local — the hosted desktop is gated by sign-in." >&2
      exit 1
    fi
    export VITE_HOSTED_ENGINE_URL="${VITE_CONTROL_PLANE_URL:-http://localhost:9080}"
    export VITE_NEW_ENGINE_URL= VITE_NEW_ENGINE_TOKEN=
    ;;
  local)
    if [ -z "${GOOGLE_DESKTOP_CLIENT_ID:-}" ]; then
      export FIREBASE_API_KEY=
    fi
    export VITE_HOSTED_ENGINE_URL=
    ;;
  *)
    echo "✗ DEV_DESKTOP_PROFILE must be 'local' or 'cloud' (got '${DEV_DESKTOP_PROFILE}')" >&2
    exit 1
    ;;
esac
exec pnpm tauri dev
