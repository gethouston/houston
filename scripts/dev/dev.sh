#!/bin/sh
# THE `pnpm dev` entry point. Order matters:
#   1. reap    — stop any dev stack left running (this machine runs ONE stack;
#                last starter wins, so parallel worktrees never fight)
#   2. doctor  — preflight tools/env/ports; hard-fails with remedies. Runs
#                AFTER the reap so only genuinely foreign port holders fail it.
#   3. marker  — record this stack's owner pid + worktree for the next reap
#                ($$ becomes the mprocs pid via exec).
set -eu
scripts/dev/reap.sh
node scripts/dev-doctor.mjs
mkdir -p "$HOME/.houston-dev"
printf '%s %s\n' "$$" "$(pwd)" > "$HOME/.houston-dev/stack.marker"
exec mprocs
