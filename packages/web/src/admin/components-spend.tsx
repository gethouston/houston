/**
 * Spend panel of the admin dashboard: the live cost estimate, the flat cluster
 * fee, and the BigQuery actuals when the export is connected (otherwise the
 * hint naming what to enable). The day-range pills are controlled by the
 * dashboard, which owns the query; this module only renders what it is handed.
 */

import type { BillingReport } from "./api";
import { usd } from "./api";
import { C, card, pill, tint } from "./styles";

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
                ...pill(d === days ? C.accent : C.muted),
                cursor: "pointer",
                background: d === days ? tint(C.accent, 16) : "transparent",
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
            accent={billing.actualsStatus === "error" ? C.red : C.muted}
          />
        )}
      </div>

      <div
        style={{ fontSize: 12, color: C.muted, marginTop: 12, lineHeight: 1.5 }}
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
          color: C.muted,
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
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}
