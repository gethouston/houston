#!/bin/sh
# `pnpm dev` pane: Postgres for the local cloud stack (gateway + control-plane).
# Data persists in the named volume `houston-dev-pg` across restarts; the
# container itself is recreated on every boot so a half-dead leftover from a
# previous run can never wedge the loop. Port 5433 (not 5432) so a system
# Postgres never collides — keep in lockstep with GW_DB_URL in .env.development.
set -eu
. scripts/dev/env.sh

docker rm -f houston-dev-pg >/dev/null 2>&1 || true
exec docker run --rm --name houston-dev-pg \
  -p 127.0.0.1:5433:5432 \
  -e POSTGRES_PASSWORD=houston \
  -v houston-dev-pg:/var/lib/postgresql/data \
  postgres:16
