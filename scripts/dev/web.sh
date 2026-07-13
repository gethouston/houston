#!/bin/sh
# `pnpm dev` pane: the web app on :1430 in CLOUD profile — VITE_CONTROL_PLANE_URL
# (from .env.development) points it at the local Go gateway, so it mounts
# CloudApp with real Google sign-in and the full multiplayer surface. The
# Firebase web config reaches the Vite define()s through the exported env
# (FIREBASE_API_KEY from .env.local; project id/domain from .env.development).
# VITE_CP_DEV_TOKEN must stay unset — the doctor enforces it.
set -eu
. scripts/dev/env.sh

exec pnpm --filter houston-web dev
