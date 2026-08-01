"use client";

import { Alert, AlertDescription, Button, Spinner } from "@houston-ai/core";

import type { InstallsDayBar } from "../types";

const compact = new Intl.NumberFormat("en", { notation: "compact" });

/** Roll per-(agent, day) rows up to per-day totals, ascending by day, each
 *  carrying its height fraction relative to the busiest day in the window. */
export function toInstallsDayBars(
  rows: ReadonlyArray<{ day: string; installs: number }>,
): InstallsDayBar[] {
  const byDay = new Map<string, number>();
  for (const row of rows)
    byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.installs);
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(0, ...byDay.values());
  return days.map(([day, installs]) => ({
    day,
    installs,
    fraction: max === 0 ? 0 : installs / max,
  }));
}

/** The three ranges the owner analytics offers, in display order. */
export const INSTALLS_RANGES = [7, 30, 90] as const;
export type InstallsRange = (typeof INSTALLS_RANGES)[number];

export interface InstallsPanelLabels {
  title: string;
  total: (count: string) => string;
  range: (days: number) => string;
  loading: string;
  empty: string;
  chart: (total: number, days: number) => string;
}

export const INSTALLS_PANEL_LABELS: InstallsPanelLabels = {
  title: "Installs",
  total: (count) => `${count} total in this range`,
  range: (days) => `${days} days`,
  loading: "Loading analytics…",
  empty: "No installs in this range yet.",
  chart: (total, days) =>
    `Installs per day: ${total} in the last ${days} active days`,
};

export interface InstallsPanelProps {
  status: "loading" | "error" | "ready";
  errorMessage?: string;
  bars: InstallsDayBar[];
  total: number;
  days: InstallsRange;
  onDaysChange: (days: InstallsRange) => void;
  labels?: Partial<InstallsPanelLabels>;
}

/**
 * The owner's install analytics: range toggle, total, per-day bars. Pure —
 * the surface fetches; this renders. Fixed content so web and app match.
 */
export function InstallsPanel({
  status,
  errorMessage,
  bars,
  total,
  days,
  onDaysChange,
  labels: overrides,
}: InstallsPanelProps) {
  const labels = { ...INSTALLS_PANEL_LABELS, ...overrides };
  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-chip-subtle p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg tracking-tight">
            {labels.title}
          </h2>
          {status === "ready" && (
            <p className="text-ink-muted text-sm">
              {labels.total(compact.format(total))}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {INSTALLS_RANGES.map((range) => (
            <Button
              key={range}
              size="sm"
              variant={days === range ? "default" : "outline"}
              onClick={() => onDaysChange(range)}
            >
              {labels.range(range)}
            </Button>
          ))}
        </div>
      </div>

      {status === "loading" && (
        <div className="flex items-center gap-3 py-8 text-ink-muted">
          <Spinner /> {labels.loading}
        </div>
      )}
      {status === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
      {status === "ready" &&
        (bars.length === 0 ? (
          <p className="py-8 text-center text-ink-muted text-sm">
            {labels.empty}
          </p>
        ) : (
          <div
            role="img"
            aria-label={labels.chart(
              bars.reduce((sum, bar) => sum + bar.installs, 0),
              bars.length,
            )}
            className="flex h-40 items-end gap-1"
          >
            {bars.map((bar) => (
              <div
                key={bar.day}
                title={`${bar.day}: ${bar.installs}`}
                className="flex-1 rounded-t bg-action/80 transition-colors hover:bg-action"
                style={{ height: `${Math.max(bar.fraction * 100, 2)}%` }}
              />
            ))}
          </div>
        ))}
    </div>
  );
}
