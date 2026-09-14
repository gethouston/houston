#!/bin/bash
# Runs one `pnpm dev` pane with its output ALSO persisted to
# $HOUSTON_HOME/logs/dev-<name>.log (the previous boot's file is kept as
# .prev). The mprocs panes are the only place the gateway, control-plane and
# host print, and a pane's scrollback dies with the stack — including when
# another worktree's `pnpm dev` reaps this one — so a bug seen in the app
# must stay readable afterwards (LOGS FIRST).
#
# bash, not sh, for `pipefail`: without it the pipe below reports tee's exit
# status, so a crashed pane looks like a clean exit to mprocs.
set -euo pipefail
name="$1"
shift
dir="${HOUSTON_HOME:-$HOME/.dev-houston}/logs"
mkdir -p "$dir"
log="$dir/dev-$name.log"
if [ -f "$log" ]; then mv -f "$log" "$log.prev"; fi
"$@" 2>&1 | tee "$log"
