/**
 * The two whole-cluster panels of the admin dashboard: the top-line stat cards
 * and the unattributed-resources panel. The orphans panel renders nothing when
 * no leaked pod or volume exists, so its absence is the healthy state. Spend
 * and per-user tables live in `components-spend.tsx` / `components-users.tsx`.
 */

import type { Overview } from "./api";
import { usd } from "./api";
import { C, card, tint } from "./styles";

/** Top-line cluster cards: users, agents, running pods, live burn. */
export function StatCards({ overview }: { overview: Overview }) {
  const t = overview.totals;
  const items = [
    { label: "Users", value: String(t.users) },
    { label: "Agents", value: String(t.agents) },
    {
      label: "Running pods",
      value: `${t.pods.running} / ${t.pods.total}`,
      hint: `${t.pods.pending} pending`,
    },
    {
      label: "Burn (est.)",
      value: `${usd(t.cost.perHourUsd)}/hr`,
      hint: `≈ ${usd(t.cost.perMonthUsd)}/mo`,
    },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 12,
      }}
    >
      {items.map((it) => (
        <div key={it.label} style={card}>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              color: C.muted,
            }}
          >
            {it.label}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>
            {it.value}
          </div>
          {it.hint && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {it.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Only rendered when leaked pods/volumes exist — an operator wants to see these. */
export function OrphansPanel({ overview }: { overview: Overview }) {
  const o = overview.orphans;
  if (o.pods.length === 0 && o.volumes.length === 0) return null;
  return (
    <div style={{ ...card, marginTop: 16, borderColor: tint(C.amber, 40) }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.amber }}>
        Unattributed resources ({usd(o.cost.perMonthUsd)}/mo)
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
        Managed pods/volumes that match no current agent — likely leaked by a
        failed delete. Worth cleaning up.
      </div>
      <div
        style={{
          marginTop: 10,
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
          color: C.text,
        }}
      >
        {o.pods.map((p) => (
          <div key={`${p.namespace}/${p.podName}`}>
            pod {p.namespace}/{p.podName} ({p.phase}) agent={p.agentId ?? "—"}
          </div>
        ))}
        {o.volumes.map((v) => (
          <div key={`${v.namespace}/${v.pvcName}`}>
            pvc {v.namespace}/{v.pvcName} agent={v.agentId ?? "—"}
          </div>
        ))}
      </div>
    </div>
  );
}
