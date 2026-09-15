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
#
# HOUSTON_HOME is honoured (default `$HOME/.dev-houston`) for parity with the
# root package.json's `dev:host`, so the pane and its logs cannot land under
# two different homes.
set -euo pipefail
if [ "$#" -lt 2 ]; then
  echo "logged.sh: usage: logged.sh <name> <command> [args...]" >&2
  exit 64
fi
name="$1"
shift
# The name becomes part of a log FILE PATH: keep it a bare identifier so a pane
# can never write outside the logs directory.
case "$name" in
  "" | *[!A-Za-z0-9._-]*)
    echo "logged.sh: pane name may contain only letters, digits, '.', '_' and '-' (got: $name)" >&2
    exit 64
    ;;
esac
dir="${HOUSTON_HOME:-$HOME/.dev-houston}/logs"
mkdir -p "$dir"
log="$dir/dev-$name.log"
if [ -f "$log" ]; then mv -f "$log" "$log.prev"; fi
"$@" 2>&1 | tee "$log"
