import { useEffect, useState } from "react";
import { Mail, Landmark, BarChart3, Send, Banknote } from "lucide-react";
import type { TabProps } from "../../lib/types";

// The agent's salvoconducto. In production this is read from the agent's
// capabilities.json; here it mirrors the "asistente-seguro" demo agent.
const SALVO = {
  scopes: {
    read: ["email:inbox", "bank:balance", "bank:transactions"],
    write: ["email:send"],
    money: [] as string[],
  },
  step_up_required_for: ["email:send", "bank:transfer"],
};

const CATALOGO = [
  { cap: "email:inbox", label: "Leer tus correos", sub: "Bandeja de entrada", Icon: Mail },
  { cap: "bank:balance", label: "Ver el saldo del banco", sub: "Solo lectura", Icon: Landmark },
  { cap: "bank:transactions", label: "Ver tus movimientos", sub: "Solo lectura", Icon: BarChart3 },
  { cap: "email:send", label: "Enviar correos", sub: "Salida al exterior", Icon: Send },
  { cap: "bank:transfer", label: "Mover dinero", sub: "Accion irreversible", Icon: Banknote },
];

type Verdict = "allow" | "deny" | "step_up";
interface Decision {
  tool: string;
  capability: string;
  decision: Verdict;
  code: string;
  message: string;
}

function classify(cap: string): { cls: string; txt: string } {
  const declared = [SALVO.scopes.read, SALVO.scopes.write, SALVO.scopes.money].some((s) =>
    s.includes(cap),
  );
  if (!declared) return { cls: "bg-[#fde9e8] text-[#c0241f]", txt: "Bloqueado" };
  if (SALVO.step_up_required_for.includes(cap))
    return { cls: "bg-[#fbf3da] text-[#976d00]", txt: "Requiere confirmacion" };
  return { cls: "bg-[#e7f6ed] text-[#00824f]", txt: "Permitido" };
}

const VERDICT: Record<Verdict, { label: string; color: string }> = {
  allow: { label: "PERMITIDO", color: "#00824f" },
  deny: { label: "BLOQUEADO", color: "#c0241f" },
  step_up: { label: "CONFIRMA", color: "#976d00" },
};

const API = "http://localhost:8787";

export default function SalvoconductoTab(_props: TabProps) {
  const [entries, setEntries] = useState<Decision[]>([]);
  const [connected, setConnected] = useState(true);
  const [inspect, setInspect] = useState(false);

  useEffect(() => {
    fetch(`${API}/inspect`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setInspect(!!d.on))
      .catch(() => {});
  }, []);

  const toggleInspect = async () => {
    const next = !inspect;
    setInspect(next);
    try {
      await fetch(`${API}/toggle/inspect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on: next }),
      });
    } catch {
      setInspect(!next); // revert if the gateway is offline
    }
  };

  const [num, setNum] = useState("");
  const [code, setCode] = useState("");
  const [enroll, setEnroll] = useState<"idle" | "sent" | "verified">("idle");
  const [enrollMsg, setEnrollMsg] = useState("");

  const startEnroll = async () => {
    if (!num.trim()) {
      setEnrollMsg("Escribe tu numero con codigo de pais.");
      return;
    }
    setEnrollMsg("Enviando codigo...");
    try {
      const r = await fetch(`${API}/enroll/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: num.trim() }),
      });
      const d = await r.json();
      if (r.ok) {
        setEnroll("sent");
        setEnrollMsg("Codigo enviado por WhatsApp. Escribelo abajo.");
      } else {
        setEnrollMsg("No se pudo enviar: " + (d.message || d.status));
      }
    } catch {
      setEnrollMsg("No hay conexion con el gateway (:8787).");
    }
  };

  const confirmEnroll = async () => {
    try {
      const r = await fetch(`${API}/enroll/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: num.trim(), code: code.trim() }),
      });
      if (r.ok) {
        setEnroll("verified");
        setEnrollMsg(`Numero verificado. Solo ${num.trim()} aprobara las acciones.`);
      } else {
        setEnrollMsg("Codigo incorrecto o vencido. Intenta de nuevo.");
      }
    } catch {
      setEnrollMsg("No hay conexion con el gateway.");
    }
  };

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("http://localhost:8787/decisions");
        if (r.ok && alive) {
          setEntries(await r.json());
          setConnected(true);
        }
      } catch {
        // Gateway offline: expected when the binary is not running. Surface it
        // quietly in the panel rather than spamming toasts every poll.
        if (alive) setConnected(false);
      }
      if (alive) setTimeout(poll, 1500);
    };
    poll();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-background">
      <div className="max-w-4xl mx-auto px-6 py-6">
        <p className="text-sm text-muted-foreground mb-4">
          La frontera vive en el codigo. La persuasion no cambia un permiso.
        </p>

        <section className="rounded-2xl border border-border p-4 mb-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Tu numero de aprobaciones
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="tel"
              placeholder="573001234567"
              value={num}
              disabled={enroll === "verified"}
              onChange={(e) => setNum(e.target.value)}
              className="h-9 px-3 rounded-lg border border-black/15 bg-background text-sm outline-none focus:border-foreground disabled:bg-accent disabled:text-muted-foreground"
            />
            <button
              type="button"
              onClick={startEnroll}
              disabled={enroll === "verified"}
              className="h-9 px-4 rounded-full bg-foreground text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-40"
            >
              Enviar codigo
            </button>
            {enroll === "sent" && (
              <>
                <input
                  inputMode="numeric"
                  placeholder="codigo de 6 digitos"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-black/15 bg-background text-sm outline-none focus:border-foreground"
                />
                <button
                  type="button"
                  onClick={confirmEnroll}
                  className="h-9 px-4 rounded-full border border-black/15 text-sm font-medium hover:bg-accent"
                >
                  Verificar
                </button>
              </>
            )}
          </div>
          <div
            className={`text-xs mt-2 ${
              enroll === "verified" ? "text-[#00824f]" : "text-muted-foreground"
            }`}
          >
            {enrollMsg ||
              "Solo un numero verificado por codigo puede aprobar acciones. Nadie pone cualquier numero."}
          </div>
        </section>

        <section className="rounded-2xl border border-border p-4 mb-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="font-medium text-foreground">
              Inspeccion de contenido (anti-fugas)
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Aunque el envio este permitido, bloquea correos que lleven claves de API,
              llaves privadas, tarjetas o contraseñas.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={inspect}
            onClick={toggleInspect}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
              inspect ? "bg-[#00824f]" : "bg-black/20"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                inspect ? "translate-x-5" : ""
              }`}
            />
          </button>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="rounded-2xl border border-border p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Permisos de este asistente
            </h2>
            {CATALOGO.map(({ cap, label, sub, Icon }) => {
              const s = classify(cap);
              return (
                <div key={cap} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                  <div className="w-9 h-9 rounded-xl bg-accent grid place-items-center shrink-0">
                    <Icon className="w-4 h-4 text-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">{label}</div>
                    <div className="text-xs text-muted-foreground">{sub}</div>
                  </div>
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ${s.cls}`}>
                    {s.txt}
                  </span>
                </div>
              );
            })}
          </section>

          <section className="rounded-2xl border border-border p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Decisiones en vivo
            </h2>
            <div className="flex flex-col gap-2 max-h-[440px] overflow-auto">
              {entries.length === 0 && (
                <div className="text-sm text-muted-foreground py-1">
                  {connected ? "Esperando actividad del agente..." : "Gateway desconectado (corre el binario en :8787)."}
                </div>
              )}
              {[...entries].reverse().map((e, i) => {
                const v = VERDICT[e.decision] ?? { label: e.decision, color: "#676767" };
                return (
                  <div
                    key={i}
                    className="rounded-xl border border-border p-3"
                    style={{ borderLeftWidth: 3, borderLeftColor: v.color }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold tracking-wide" style={{ color: v.color }}>
                        {v.label}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {e.tool} ({e.capability})
                      </span>
                      {e.code === "tainted_to_sensitive_sink" && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#fbf3da] text-[#976d00]">
                          fuente no confiable
                        </span>
                      )}
                    </div>
                    {e.message && <div className="text-sm text-foreground mt-1">{e.message}</div>}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Las decisiones las toma el motor de Centinela, no el modelo.
        </p>
      </div>
    </div>
  );
}
