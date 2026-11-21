import type { CreatorInstallRow } from "@houston/agentstore-client";

export interface DayBar {
  day: string;
  installs: number;
  fraction: number;
}

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
