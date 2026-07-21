#!/bin/sh
# `pnpm dev:reset` — reset the LOCAL dev environment to from-zero, so the next
# `pnpm dev` boots like a brand-new install. Never touches prod or staging
# (that is cloud's `make reset-test-user`, scoped to the hosted test account).
#
# What it clears, and why each layer exists:
#   1. The dev stack + Postgres volume  — the local gateway's users/orgs/agents/prefs.
#   2. ~/Library/WebKit/houston-app     — the dev app's WKWebView container:
#      localStorage (device prefs like onboarding_completed, the dev session)
#      and caches. NOTE the container is named after the productName
#      ("houston-app"), NOT the bundle id com.houston.app — wiping the wrong
#      dir leaves stale first-run flags behind and skips onboarding.
#   3. ~/.houston (ONLY with --with-data) — local agent/workspace data. Keep it
#      when testing the cloud-migration flow: it IS the migration source; the
#      offer only appears when legacy workspaces exist.
set -eu
cd "$(dirname "$0")/../.."

WITH_DATA=0
for arg in "$@"; do
  case "$arg" in
    --with-data) WITH_DATA=1 ;;
    *) echo "usage: pnpm dev:reset [--with-data]   (--with-data also removes ~/.houston)" >&2; exit 1 ;;
  esac
done

echo "dev:reset — stopping the dev stack…"
scripts/dev/reap.sh

echo "dev:reset — removing the dev Postgres volume…"
docker volume rm houston-dev-pg >/dev/null 2>&1 || echo "  (volume already absent)"

echo "dev:reset — clearing the dev app's WebKit container (~/Library/WebKit/houston-app)…"
rm -rf "$HOME/Library/WebKit/houston-app"

if [ "$WITH_DATA" = "1" ]; then
  echo "dev:reset — removing local agent data (~/.houston)…"
  rm -rf "$HOME/.houston"
else
  echo "dev:reset — keeping ~/.houston (migration source; pass --with-data to remove)"
fi

echo "dev:reset — done. Run 'pnpm dev' for a from-zero boot."
