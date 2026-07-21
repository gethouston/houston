/**
 * Pure shaping of the creator install-analytics payload into what the bar chart
 * renders. The gateway returns one row per (agent, UTC day) but the owner's chart
 * shows installs per day across ALL their agents, so we roll rows up by day. Kept
 * pure (no React, no fetch) so it is unit-testable in the node vitest env.
 */
import type { CreatorInstallRow } from "@houston/agentstore-client";

/** One day's rolled-up install count, plus its share of the busiest day (0–1). */
export interface DayBar {
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  installs: number;
  /** `installs / max(installs)`, for the bar height; 0 when the window is empty. */
  fraction: number;
}

/**
 * Roll per-(agent, day) rows up to per-day totals, ascending by day, each carrying
 * its height fraction relative to the busiest day in the window.
 */
export function toDayBars(rows: CreatorInstallRow[]): DayBar[] {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.installs);
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  const max = days.reduce((m, [, installs]) => Math.max(m, installs), 0);
  return days.map(([day, installs]) => ({
    day,
    installs,
    fraction: max > 0 ? installs / max : 0,
  }));
}
