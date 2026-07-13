#!/bin/sh
# Reap the Houston dev stack, wherever it was started. This machine runs ONE
# dev stack — `pnpm dev` calls this before booting (last starter wins, so a
# stack left running in another worktree never blocks you), and `pnpm dev:down`
# is this script directly.
#
# Kill order: the recorded mprocs owner first (graceful), then a signature
# sweep for orphans that escaped their pane (a compiled `go run` child survives
# its wrapper — learned the hard way), then the pg container, then the holders
# of OUR ports if their command is recognizably ours. Anything foreign on a
# port is deliberately left alone — the doctor names it and fails.
set -eu

MARKER="$HOME/.houston-dev/stack.marker"
# Every port the stack owns; 1420 is the desktop app's own vite dev server.
PORTS="5433 9080 8081 4318 1430 1420"
# Commands that are unambiguously the Houston dev stack.
SIGNATURES="exe/gateway
exe/control-plane
go run ./cmd/gateway
go run ./cmd/control-plane
tsx src/local/main.ts
--filter @houston/host dev
--filter houston-web dev"
# What a Houston-owned port holder may look like (vite/tauri/node stragglers).
OWNED_RE='mprocs|vite|tauri|gateway|control-plane|tsx|pnpm|node|cargo'

reaped=0

# 1. The recorded owner: TERM the mprocs process, give it time to stop panes.
if [ -f "$MARKER" ]; then
  read -r pid root < "$MARKER" || true
  if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
    printf 'stopping the dev stack started in %s (pid %s)\n' "${root:-?}" "$pid"
    kill -TERM "$pid" 2>/dev/null || true
    i=0
    while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 100 ]; do
      i=$((i + 1))
      sleep 0.1
    done
    kill -9 "$pid" 2>/dev/null || true
    reaped=1
  fi
  rm -f "$MARKER"
fi

# 2. Orphan sweep by signature (panes that outlived mprocs, engines that
# outlived the control-plane, compiled go-run children).
echo "$SIGNATURES" | while IFS= read -r sig; do
  pkill -TERM -f "$sig" 2>/dev/null || true
done
sleep 1
echo "$SIGNATURES" | while IFS= read -r sig; do
  pkill -9 -f "$sig" 2>/dev/null || true
done

# 3. The dev Postgres container (data persists in the houston-dev-pg volume).
docker rm -f houston-dev-pg >/dev/null 2>&1 || true

# 4. Port backstop: reap a leftover holder of OUR ports only when its command
# looks like ours. A foreign process is left for the doctor to report.
for port in $PORTS; do
  for pid in $(lsof -ti "tcp:$port" 2>/dev/null); do
    cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if printf '%s' "$cmd" | grep -qE "$OWNED_RE"; then
      printf 'reaping leftover on :%s — %s (pid %s)\n' "$port" "${cmd%% *}" "$pid"
      kill -9 "$pid" 2>/dev/null || true
      reaped=1
    fi
  done
done

[ "$reaped" = "1" ] && echo "previous dev stack stopped."
exit 0
