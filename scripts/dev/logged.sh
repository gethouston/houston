#!/bin/sh
# Runs one `pnpm dev` pane with its output ALSO persisted to
# $HOME/.dev-houston/logs/dev-<name>.log (the previous boot's file is kept as
# .prev). The mprocs panes are the only place the gateway, control-plane and
# host print, and a pane's scrollback dies with the stack — including when
# another worktree's `pnpm dev` reaps this one — so a bug seen in the app
# must stay readable afterwards (LOGS FIRST).
set -eu
name="$1"
shift
dir="$HOME/.dev-houston/logs"
mkdir -p "$dir"
log="$dir/dev-$name.log"
[ -f "$log" ] && mv -f "$log" "$log.prev"
"$@" 2>&1 | tee "$log"
