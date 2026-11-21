#!/bin/sh
set -eu
scripts/dev/reap.sh
node scripts/dev-doctor.mjs
mkdir -p "$HOME/.houston-dev"
printf '%s %s\n' "$$" "$(pwd)" > "$HOME/.houston-dev/stack.marker"
exec mprocs
