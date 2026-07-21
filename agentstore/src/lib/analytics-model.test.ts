import type { CreatorInstallRow } from "@houston/agentstore-client";
import { describe, expect, it } from "vitest";
import { toDayBars } from "./analytics-model";

function row(
  agentId: string,
  day: string,
  installs: number,
): CreatorInstallRow {
  return { agentId, slug: null, day, installs };
}

describe("toDayBars", () => {
  it("rolls multiple agents up into per-day totals, ascending by day", () => {
    const bars = toDayBars([
      row("a", "2026-07-02", 3),
      row("b", "2026-07-02", 2),
      row("a", "2026-07-01", 5),
    ]);
    expect(bars.map((b) => [b.day, b.installs])).toEqual([
      ["2026-07-01", 5],
      ["2026-07-02", 5],
    ]);
  });

  it("computes the height fraction relative to the busiest day", () => {
    const bars = toDayBars([
      row("a", "2026-07-01", 2),
      row("a", "2026-07-02", 8),
    ]);
    expect(bars[0]?.fraction).toBeCloseTo(0.25);
    expect(bars[1]?.fraction).toBe(1);
  });

  it("returns an empty array for no rows", () => {
    expect(toDayBars([])).toEqual([]);
  });
});
