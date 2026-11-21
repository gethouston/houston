#!/bin/sh
set -eu
. scripts/dev/env.sh

export VITE_NEW_ENGINE_URL=
export VITE_NEW_ENGINE_TOKEN=

exec pnpm --filter houston-web dev
