import { useState } from "react";
import type { AgentView, BillingReport, Overview, UserView } from "./api";
import { usd } from "./api";
import { C, card, pill, stateColor, td, th } from "./styles";

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
              color: C.faint,
            }}
          >
            {it.label}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>
            {it.value}
          </div>
          {it.hint && (
            <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
              {it.hint}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Spend: live estimate total + the BigQuery actuals (or how to enable them). */
export function SpendPanel({
  billing,
  days,
  onDays,
}: {
  billing: BillingReport;
  days: number;
  onDays: (d: number) => void;
}) {
  const e = billing.estimate;
  return (
    <div style={{ ...card, marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700 }}>Spending</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDays(d)}
              style={{
                ...pill(d === days ? C.accent : C.faint),
                cursor: "pointer",
                background: d === days ? `${C.accent}2a` : "transparent",
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
          marginTop: 14,
        }}
      >
        <Metric
          label="Estimated monthly run-rate"
          value={`${usd(e.total.perMonthUsd)}/mo`}
          sub={`${usd(e.total.perHourUsd)}/hr right now`}
        />
        <Metric
          label="Cluster management fee"
          value={`${usd(e.clusterFeeMonthUsd)}/mo`}
          sub="flat; offset by the GKE free tier"
        />
        {billing.actuals ? (
          <Metric
            label={`Actual billed (last ${billing.actuals.rangeDays}d)`}
            value={usd(billing.actuals.totalUsd)}
            sub={`${billing.actuals.startDate} → ${billing.actuals.endDate} · ${billing.currency}`}
            accent={C.green}
          />
        ) : (
          <Metric
            label={`Actual billed (last ${days}d)`}
            value="—"
            sub={actualsHint(billing)}
            accent={billing.actualsStatus === "error" ? C.red : C.faint}
          />
        )}
      </div>

      <div
        style={{ fontSize: 12, color: C.dim, marginTop: 12, lineHeight: 1.5 }}
      >
        {billing.note}
      </div>
      {billing.actualsStatus === "error" && billing.actualsError && (
        <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>
          BigQuery error: {billing.actualsError}
        </div>
      )}
    </div>
  );
}

function actualsHint(billing: BillingReport): string {
  if (billing.actualsStatus === "error")
    return "BigQuery query failed (see below)";
  return "Not connected. Enable billing export + GKE cost allocation (see cloud/billing.md).";
}

function Metric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: C.panel2,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: C.faint,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          marginTop: 6,
          color: accent ?? C.text,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

/** Per-user rows; click to expand the user's agents + pod detail. */
export function UsersTable({
  overview,
  billing,
}: {
  overview: Overview;
  billing: BillingReport | null;
}) {
  // Authoritative billed cost per namespace, when BigQuery actuals are connected.
  const actualByNs = new Map<string, number>();
  if (billing?.actuals) {
    for (const u of billing.estimate.byUser) {
      if (u.actualUsd != null) actualByNs.set(u.namespace, u.actualUsd);
    }
  }
  return (
    <div style={{ ...card, marginTop: 16, padding: 0, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>User / workspace</th>
            <th style={th}>Agents</th>
            <th style={th}>Running</th>
            <th style={th}>Storage</th>
            <th style={{ ...th, textAlign: "right" }}>Est. / mo</th>
          </tr>
        </thead>
        <tbody>
          {overview.users.length === 0 && (
            <tr>
              <td style={{ ...td, color: C.dim }} colSpan={5}>
                No users yet.
              </td>
            </tr>
          )}
          {overview.users.map((u) => (
            <UserRow
              key={u.workspaceId}
              u={u}
              actual={actualByNs.get(u.namespace)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRow({ u, actual }: { u: UserView; actual?: number }) {
  const [open, setOpen] = useState(false);
  const storage = u.agents.reduce((acc, a) => acc + a.storageGiB, 0);
  const toggle = () => setOpen((v) => !v);
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: <tr> must stay a table row — converting to <button> produces invalid HTML inside <tbody>; keyboard handling is provided via onKeyDown */}
      <tr
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        style={{ cursor: "pointer" }}
      >
        <td style={td}>
          <span style={{ color: C.faint, marginRight: 6 }} aria-hidden>
            {open ? "▾" : "▸"}
          </span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
            {u.namespace}
          </span>
          <div style={{ fontSize: 11, color: C.faint, marginLeft: 18 }}>
            {u.userId}
          </div>
        </td>
        <td style={td}>{u.agents.length}</td>
        <td style={td}>{u.runningAgents}</td>
        <td style={td}>{storage ? `${storage.toFixed(0)} GiB` : "—"}</td>
        <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>
          {usd(u.cost.perMonthUsd)}
          {actual != null && (
            <div style={{ fontSize: 11, color: C.green }}>
              {usd(actual)} billed
            </div>
          )}
        </td>
      </tr>
      {open &&
        u.agents.map((a) => (
          <tr key={a.agentId} style={{ background: C.panel2 }}>
            <td style={{ ...td, paddingLeft: 28 }} colSpan={5}>
              <AgentDetail a={a} />
            </td>
          </tr>
        ))}
      {open && u.agents.length === 0 && (
        <tr style={{ background: C.panel2 }}>
          <td style={{ ...td, paddingLeft: 28, color: C.dim }} colSpan={5}>
            No agents.
          </td>
        </tr>
      )}
    </>
  );
}

function AgentDetail({ a }: { a: AgentView }) {
  const color = stateColor[a.state] ?? C.faint;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontWeight: 600, minWidth: 120 }}>{a.name}</span>
      <span style={pill(color)}>{a.state}</span>
      {a.pod ? (
        <span style={{ fontSize: 12, color: C.dim }}>
          {a.pod.phase}
          {a.pod.ready ? " · ready" : " · not ready"}
          {a.pod.nodeName ? ` · ${a.pod.nodeName}` : ""}
          {` · ${a.pod.cpuRequestCores} vCPU / ${a.pod.memRequestMiB} MiB`}
          {a.pod.restarts > 0 ? ` · ${a.pod.restarts} restarts` : ""}
        </span>
      ) : (
        <span style={{ fontSize: 12, color: C.faint }}>no pod</span>
      )}
      <span style={{ fontSize: 12, color: C.dim, marginLeft: "auto" }}>
        {a.storageGiB ? `${a.storageGiB} GiB · ` : ""}
        {usd(a.cost.perMonthUsd)}/mo
      </span>
    </div>
  );
}

/** Only rendered when leaked pods/volumes exist — an operator wants to see these. */
export function OrphansPanel({ overview }: { overview: Overview }) {
  const o = overview.orphans;
  if (o.pods.length === 0 && o.volumes.length === 0) return null;
  return (
    <div style={{ ...card, marginTop: 16, borderColor: `${C.amber}66` }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.amber }}>
        Unattributed resources ({usd(o.cost.perMonthUsd)}/mo)
      </div>
      <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>
        Managed pods/volumes that match no current agent — likely leaked by a
        failed delete. Worth cleaning up.
      </div>
      <div
        style={{
          marginTop: 10,
          fontFamily: "ui-monospace, monospace",
          fontSize: 12,
          color: C.dim,
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
