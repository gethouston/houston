#!/bin/sh
# `pnpm dev` pane: the desktop app (Tauri) against the host pane — the LOCAL
# profile (terminal, reveal-in-OS, dictation, local models).
#
# Desktop LOGIN/LOGOUT are real (Google loopback+PKCE → GCIP, session in the
# Keychain, sign-out in Settings → Account) when GOOGLE_DESKTOP_CLIENT_ID(+
# _SECRET) are in .env.local. Without them the pane blanks FIREBASE_API_KEY so
# the auth gate never mounts: a mounted gate would be UNCOMPLETABLE in dev
# (no client id, and desktop email-OTP posts to the engine URL — the local
# host, which has no auth routes). The doctor matrix states which mode you're
# in; account/cloud features always work in the web pane either way.
set -eu
. scripts/dev/env.sh

if [ -z "${GOOGLE_DESKTOP_CLIENT_ID:-}" ]; then
  export FIREBASE_API_KEY=
fi
export VITE_HOSTED_ENGINE_URL=
cd app
exec pnpm tauri dev
