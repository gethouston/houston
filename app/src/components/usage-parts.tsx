import type { ReactNode } from "react";

export { fmtTokens, fmtCost, shortModel } from "../lib/usage-format";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      {children}
    </div>
  );
}

export function KpiCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

export function DataBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 rounded-full bg-border overflow-hidden">
      <div
        className="h-full rounded-full bg-foreground/60 transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
