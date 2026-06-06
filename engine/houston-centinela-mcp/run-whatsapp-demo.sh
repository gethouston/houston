#!/usr/bin/env bash
# Orchestrates the live WhatsApp approval demo: starts the cloudflared tunnel,
# prints the URL to configure in Meta, then runs the gateway. See
# WHATSAPP-SETUP.md for the full walkthrough. Credentials come from the
# environment; this script never reads or writes a secret.
set -euo pipefail

for var in WHATSAPP_TOKEN WHATSAPP_PHONE_NUMBER_ID WHATSAPP_RECIPIENT; do
  if [ -z "${!var:-}" ]; then
    echo "Falta la variable $var. Exporta las tres antes de correr (ver WHATSAPP-SETUP.md)." >&2
    exit 1
  fi
done

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PORT="${CENTINELA_WEBHOOK_PORT:-8787}"
export CENTINELA_LOG="${CENTINELA_LOG:-$REPO_ROOT/engine/houston-centinela-mcp/ui/decisions.jsonl}"
export WHATSAPP_VERIFY_TOKEN="${WHATSAPP_VERIFY_TOKEN:-centinela}"

echo "Compilando gateway..."
( cd "$REPO_ROOT" && cargo build -q -p houston-centinela-mcp )

TUNNEL_LOG="$(mktemp)"
echo "Levantando tunel cloudflared en :$PORT ..."
cloudflared tunnel --url "http://localhost:$PORT" >"$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!
trap 'kill "$TUNNEL_PID" 2>/dev/null || true' EXIT

URL=""
for _ in $(seq 1 30); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)"
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "$URL" ]; then
  echo "No se pudo obtener la URL del tunel. Revisa: $TUNNEL_LOG" >&2
  exit 1
fi

cat <<EOF

==> Configura en Meta (WhatsApp > Configuration > Webhook):
      Callback URL : $URL/webhook
      Verify token : $WHATSAPP_VERIFY_TOKEN
      Suscribe el campo: messages

Cuando el webhook este verificado, pega un frame de step-up aqui abajo, por ej:
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_email","arguments":{"to":"noreply@api.santoria.app","subject":"hola","body":"prueba"}}}

Tu telefono vibrara. Responde SI o NO.
EOF

exec "$REPO_ROOT/target/debug/houston-centinela-mcp"
