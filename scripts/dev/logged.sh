#!/bin/bash
set -euo pipefail
if [ "$#" -lt 2 ]; then
  echo "logged.sh: usage: logged.sh <name> <command> [args...]" >&2
  exit 64
fi
name="$1"
shift
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
