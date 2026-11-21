#!/bin/sh
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
