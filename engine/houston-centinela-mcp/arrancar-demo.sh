#!/usr/bin/env bash
# arrancar-demo.sh — levanta TODO el demo de Centinela con un solo comando:
# el gateway, la UI, el tunel publico y (si das las credenciales) el webhook de
# Meta para recibir tu SI/NO.
#
# Uso minimo (token fresco de Meta, dura ~1h):
#   WHATSAPP_TOKEN=EAAxxxxx ./arrancar-demo.sh
#
# Uso completo (para que el SI/NO por WhatsApp resuelva solo):
#   WHATSAPP_TOKEN=EAAxxx META_APP_ID=123 META_APP_SECRET=abc ./arrancar-demo.sh
set -euo pipefail
cd "$(dirname "$0")"          # engine/houston-centinela-mcp
ROOT="../.."                  # houston/

TOKEN="${WHATSAPP_TOKEN:-${1:-}}"
[ -z "$TOKEN" ] && { echo "Falta el token:  WHATSAPP_TOKEN=EAAxxx ./arrancar-demo.sh"; exit 1; }

export WHATSAPP_TOKEN="$TOKEN"
export WHATSAPP_PHONE_NUMBER_ID="678636712004109"
export WHATSAPP_VERIFY_TOKEN="centinela"
export WHATSAPP_RECIPIENT="573058166527"     # tu numero, sembrado como verificado
export CENTINELA_LOG="$PWD/ui/decisions.jsonl"

echo "1/4  Compilando + arrancando el gateway..."
( cd "$ROOT" && cargo build -q -p houston-centinela-mcp )
pkill -f houston-centinela-mcp 2>/dev/null || true; sleep 1
: > "$CENTINELA_LOG"
sleep 86400 | "$ROOT/target/debug/houston-centinela-mcp" 2>/tmp/centinela-gw.log &
sleep 2
curl -s --retry 15 --retry-connrefused --retry-delay 1 -o /dev/null "http://localhost:8787/permissions" \
  && echo "     gateway OK en :8787"

echo "2/4  Arrancando la UI..."
pkill -f "http.server 8848" 2>/dev/null || true; sleep 1
( cd ui && python3 -m http.server 8848 >/dev/null 2>&1 & )
echo "     UI en http://localhost:8848"

echo "3/4  Tunel publico (cloudflared)..."
pkill -f "cloudflared tunnel" 2>/dev/null || true; sleep 1
cloudflared tunnel --url http://localhost:8787 >/tmp/cloudflared.log 2>&1 &
sleep 7
URL=$(grep -ohE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/cloudflared.log | tail -1 || true)
echo "     URL publica: ${URL:-(revisa /tmp/cloudflared.log)}"

if [ -n "${META_APP_ID:-}" ] && [ -n "${META_APP_SECRET:-}" ] && [ -n "$URL" ]; then
  echo "4/4  Apuntando el webhook de Meta a $URL/webhook ..."
  curl -s -X POST "https://graph.facebook.com/v21.0/${META_APP_ID}/subscriptions" \
    -d "object=whatsapp_business_account" \
    -d "callback_url=${URL}/webhook" \
    -d "verify_token=centinela" \
    -d "fields=messages" \
    -d "access_token=${META_APP_ID}|${META_APP_SECRET}" >/dev/null \
    && echo "     webhook configurado."
else
  echo "4/4  Webhook de Meta: configuralo a mano (Meta > WhatsApp > Configuration):"
  echo "       callback URL = ${URL:-<url>}/webhook"
  echo "       verify token = centinela"
  echo "       campo        = messages"
  echo "     (o exporta META_APP_ID y META_APP_SECRET y vuelve a correr esto)"
fi

echo ""
echo "================== DEMO ARRIBA =================="
echo "  UI / permisos:  http://localhost:8848   (o el tab Salvoconducto en Houston)"
echo "  Pedir permiso:  ./pedir-permiso.sh \"enviar un correo con tus movimientos\""
echo "  Los 3 ataques:  ./demo-flow.sh"
echo "================================================="
