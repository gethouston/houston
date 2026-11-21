#!/bin/sh
set -eu
. scripts/dev/env.sh

docker rm -f houston-dev-pg >/dev/null 2>&1 || true
exec docker run --rm --name houston-dev-pg \
  -p 127.0.0.1:5433:5432 \
  -e POSTGRES_PASSWORD=houston \
  -v houston-dev-pg:/var/lib/postgresql/data \
  postgres:16
