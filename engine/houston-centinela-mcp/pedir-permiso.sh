#!/usr/bin/env bash
# pedir-permiso.sh — simula una accion de un agente y te manda la aprobacion a
# tu WhatsApp. Respondes SI o NO en el chat y el resultado vuelve aqui.
#
# Uso:
#   ./pedir-permiso.sh                                  # accion por defecto
#   ./pedir-permiso.sh "enviar un correo con tus movimientos"
#   ./pedir-permiso.sh "transferir $200.000" "asistente-banco"
#
# Requisitos (ya montados en el demo):
#   - El gateway de Centinela corriendo en :8787 con tu token de WhatsApp.
#   - Tu numero verificado (o sembrado con WHATSAPP_RECIPIENT).
#   - cloudflared + el webhook de Meta activos para recibir tu SI/NO.
set -euo pipefail

ACCION="${1:-enviar un correo a tu jefe}"
AGENTE="${2:-asistente-seguro}"
GATEWAY="${CENTINELA_GATEWAY:-http://localhost:8787}"

if ! curl -s --max-time 3 -o /dev/null "$GATEWAY/permissions"; then
  echo "No encuentro el gateway en $GATEWAY."
  echo "Arrancalo primero (con tu token de WhatsApp) y vuelve a intentar."
  exit 1
fi

echo "================================================================"
echo "  El agente '$AGENTE' quiere: $ACCION"
echo "  Te llego la solicitud a WhatsApp. Responde SI o NO."
echo "  (esperando tu respuesta, hasta 120s...)"
echo "================================================================"

RESP=$(curl -s -X POST "$GATEWAY/demo/request" \
  -H "Content-Type: application/json" \
  -d "$(printf '{"agent":"%s","action":"%s"}' "$AGENTE" "$ACCION")")

OUTCOME=$(printf '%s' "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('outcome','?'))" 2>/dev/null || echo "?")
case "$OUTCOME" in
  approved) echo "RESULTADO: APROBADO por ti. El agente ejecuta la accion." ;;
  denied)   echo "RESULTADO: RECHAZADO por ti. Centinela bloquea la accion." ;;
  timeout)  echo "RESULTADO: sin respuesta a tiempo. Bloqueado por seguridad." ;;
  *)        echo "RESULTADO: $RESP" ;;
esac
