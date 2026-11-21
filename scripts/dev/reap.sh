#!/bin/sh
set -eu

MARKER="$HOME/.houston-dev/stack.marker"
PORTS="5433 9080 9091 8081 9092 4318 1430 1420"
SIGNATURES="exe/gateway
exe/control-plane
go run ./cmd/gateway
go run ./cmd/control-plane
tsx src/local/main.ts
cli.mjs src/local/main.ts
loader.mjs src/local/main.ts
packages/runtime/src/main.ts
--filter @houston/host dev
--filter houston-web dev
cloudflared tunnel run"
OWNED_RE='mprocs|vite|tauri|gateway|control-plane|tsx|pnpm|node|cargo'

reaped=0

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

echo "$SIGNATURES" | while IFS= read -r sig; do
  pkill -TERM -f "$sig" 2>/dev/null || true
done
sleep 1
echo "$SIGNATURES" | while IFS= read -r sig; do
  pkill -9 -f "$sig" 2>/dev/null || true
done

docker rm -f houston-dev-pg >/dev/null 2>&1 || true

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
