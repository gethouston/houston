/**
 * Per-user table of the admin dashboard: one row per workspace, expandable to
 * the user's agents and their pod detail. Rows stay `<tr>` elements (a
 * `<button>` is invalid inside `<tbody>`), so keyboard activation is wired by
 * hand. Billed cost is shown beside the estimate only when the BigQuery
 * actuals are connected and carry a figure for that namespace.
 */

import { useState } from "react";
import type { AgentView, BillingReport, Overview, UserView } from "./api";
import { usd } from "./api";
import { C, card, pill, stateColor, td, th } from "./styles";

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
              <td style={{ ...td, color: C.text }} colSpan={5}>
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
          <span style={{ color: C.muted, marginRight: 6 }} aria-hidden>
            {open ? "▾" : "▸"}
          </span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
            {u.namespace}
          </span>
          <div style={{ fontSize: 11, color: C.muted, marginLeft: 18 }}>
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
          <td style={{ ...td, paddingLeft: 28, color: C.text }} colSpan={5}>
            No agents.
          </td>
        </tr>
      )}
    </>
  );
}

function AgentDetail({ a }: { a: AgentView }) {
  const color = stateColor[a.state] ?? C.muted;
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
        <span style={{ fontSize: 12, color: C.text }}>
          {a.pod.phase}
          {a.pod.ready ? " · ready" : " · not ready"}
          {a.pod.nodeName ? ` · ${a.pod.nodeName}` : ""}
          {` · ${a.pod.cpuRequestCores} vCPU / ${a.pod.memRequestMiB} MiB`}
          {a.pod.restarts > 0 ? ` · ${a.pod.restarts} restarts` : ""}
        </span>
      ) : (
        <span style={{ fontSize: 12, color: C.muted }}>no pod</span>
      )}
      <span style={{ fontSize: 12, color: C.text, marginLeft: "auto" }}>
        {a.storageGiB ? `${a.storageGiB} GiB · ` : ""}
        {usd(a.cost.perMonthUsd)}/mo
      </span>
    </div>
  );
}
