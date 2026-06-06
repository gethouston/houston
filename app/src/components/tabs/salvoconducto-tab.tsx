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

export default function SalvoconductoTab(_props: TabProps) {
  const [entries, setEntries] = useState<Decision[]>([]);
  const [connected, setConnected] = useState(true);

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
