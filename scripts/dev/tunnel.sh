#!/bin/sh
# `pnpm dev` pane: a Cloudflare named tunnel that exposes the local gateway on
# a STABLE public https hostname, so Slack can deliver events and complete
# OAuth against :9080. Per-developer knobs in .env.local (the doctor checks
# both): CLOUDFLARE_TUNNEL (the tunnel name, created once with
# `cloudflared tunnel login && cloudflared tunnel create <name> &&
# cloudflared tunnel route dns <name> <host>`) and GW_PUBLIC_BASE_URL=https://<host>.
# Without CLOUDFLARE_TUNNEL the pane idles: the gateway stays local-only.
set -eu
. scripts/dev/env.sh

if [ -z "${CLOUDFLARE_TUNNEL:-}" ]; then
  echo "tunnel OFF — set CLOUDFLARE_TUNNEL=<name> + GW_PUBLIC_BASE_URL=https://<host> in .env.local to expose the gateway (Slack channel)"
  exit 0
fi
exec cloudflared tunnel run --url "http://localhost:${GW_PORT}" "$CLOUDFLARE_TUNNEL"
