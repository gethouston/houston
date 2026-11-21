#!/bin/sh
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
