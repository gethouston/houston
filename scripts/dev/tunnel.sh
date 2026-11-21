#!/bin/sh
set -eu
. scripts/dev/env.sh

if [ -z "${CLOUDFLARE_TUNNEL:-}" ]; then
  echo "tunnel OFF — set CLOUDFLARE_TUNNEL=<name> + GW_PUBLIC_BASE_URL=https://<host> in .env.local to expose the gateway (Slack channel)"
  exit 0
fi
exec cloudflared tunnel run --url "http://localhost:${GW_PORT}" "$CLOUDFLARE_TUNNEL"
