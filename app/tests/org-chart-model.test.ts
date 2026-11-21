import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ComputeUsageRow, UsageRow } from "@houston/engine-adapter";
import {
  hoursAvailable,
  orgChartUsage,
  orgChartWork,
  usageWindow,
} from "../src/components/organization/org-chart-model.ts";

const NOW = new Date("2026-09-26T23:30:00-05:00");
const agents = [
  { id: "writer", folderPath: "workspace/writer" },
  { id: "researcher", folderPath: "workspace/researcher" },
];
const row = (
  agentSlug: string,
  userId: string,
  day: string,
  messages: number,
): UsageRow => ({ agentSlug, userId, day, messages });

describe("usageWindow", () => {
  it("is 30 UTC days ending on today's UTC date, oldest first", () => {
    const days = usageWindow(NOW);
    strictEqual(days.length, 30);
    strictEqual(days[29], "2026-09-27");
    strictEqual(days[0], "2026-08-29");
  });

  it("crosses month and year edges one day at a time", () => {
    deepStrictEqual(usageWindow(new Date("2027-01-01T00:00:00Z"), 3), [
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
    ]);
  });
});

describe("orgChartUsage", () => {
  it("resolves ids and route keys and splits each agent by person", () => {
    const usage = orgChartUsage(
      agents,
      [
        row("workspace/writer", "ana", "2026-09-27", 4),
        row("writer", "leo", "2026-09-27", 3),
        row("writer", "ana", "2026-09-25", 2),
      ],
      NOW,
    );
    const writer = usage.byAgent.get("writer");
    strictEqual(writer?.total, 9);
    deepStrictEqual(writer?.talkers, [
      { userId: "ana", messages: 6 },
      { userId: "leo", messages: 3 },
    ]);
    strictEqual(usage.series.length, 30);
    strictEqual(usage.series[29], 7);
    strictEqual(usage.series[27], 2);
    strictEqual(usage.byAgent.get("researcher")?.total, 0);
  });

  it("sums the org series across agents", () => {
    const usage = orgChartUsage(
      agents,
      [
        row("writer", "ana", "2026-09-27", 4),
        row("researcher", "ana", "2026-09-27", 6),
      ],
      NOW,
    );
    strictEqual(usage.series[29], 10);
    strictEqual(usage.total, 10);
  });

  it("counts only the window the series draws, so total and chart agree", () => {
    const usage = orgChartUsage(
      agents,
      [
        row("writer", "ana", "2026-08-28", 5),
        row("writer", "ana", "2026-08-29", 2),
      ],
      NOW,
    );
    strictEqual(usage.byAgent.get("writer")?.total, 2);
    strictEqual(usage.total, 2);
    strictEqual(
      usage.series.reduce((sum, n) => sum + n, 0),
      usage.total,
    );
    deepStrictEqual(usage.byAgent.get("writer")?.talkers, [
      { userId: "ana", messages: 2 },
    ]);
  });

  it("names the window's first day beside the series it counts", () => {
    strictEqual(orgChartUsage(agents, [], NOW).from, "2026-08-29");
  });

  it("ignores unknown agents and non-positive or broken counts", () => {
    const usage = orgChartUsage(
      agents,
      [
        row("ghost", "ana", "2026-09-27", 9),
        row("writer", "ana", "2026-09-27", 0),
        row("writer", "ana", "2026-09-27", -2),
        row("writer", "ana", "2026-09-27", Number.NaN),
      ],
      NOW,
    );
    strictEqual(usage.total, 0);
    deepStrictEqual(usage.byAgent.get("writer")?.talkers, []);
  });
});

const HOUR = 3_600_000;
const work = (agentSlug: string, day: string, activeMs: number) =>
  ({
    agentSlug,
    day,
    activeMs,
    awakeMs: activeMs * 3,
    wakes: 1,
    turns: 1,
    routineRuns: 0,
  }) satisfies ComputeUsageRow;

describe("orgChartWork", () => {
  it("totals time worked per agent by id or route key, never awake time", () => {
    const hours = orgChartWork(
      agents,
      [
        work("workspace/writer", "2026-09-27", 2 * HOUR),
        work("writer", "2026-09-26", HOUR),
        work("researcher", "2026-09-27", HOUR / 2),
      ],
      NOW,
    );
    strictEqual(hours.byAgent.get("writer"), 3 * HOUR);
    strictEqual(hours.byAgent.get("researcher"), HOUR / 2);
    strictEqual(hours.total, 3.5 * HOUR);
  });

  it("buckets 30 UTC days ending today, zero-filled, oldest first", () => {
    const hours = orgChartWork(
      agents,
      [
        work("writer", "2026-09-27", HOUR),
        work("writer", "2026-08-29", 2 * HOUR),
      ],
      NOW,
    );
    strictEqual(hours.series.length, 30);
    strictEqual(hours.series[29], HOUR);
    strictEqual(hours.series[0], 2 * HOUR);
    strictEqual(
      hours.series.slice(1, 29).every((ms) => ms === 0),
      true,
    );
  });

  it("drops rows outside the window and agents the caller does not have", () => {
    const hours = orgChartWork(
      agents,
      [
        work("writer", "2026-08-28", 5 * HOUR),
        work("deleted-agent", "2026-09-27", 9 * HOUR),
      ],
      NOW,
    );
    strictEqual(hours.total, 0);
    strictEqual(hours.byAgent.get("writer"), 0);
    deepStrictEqual(hours.series, Array(30).fill(0));
  });

  it("names the window's first day beside the series it counts", () => {
    strictEqual(orgChartWork(agents, [], NOW).from, "2026-08-29");
  });

  it("folds a row dated past today into today rather than losing it", () => {
    const hours = orgChartWork(
      agents,
      [work("writer", "2026-09-28", HOUR)],
      NOW,
    );
    strictEqual(hours.series[29], HOUR);
    strictEqual(hours.total, HOUR);
  });

  it("counts an agent whose id is its route key once", () => {
    const hours = orgChartWork(
      [{ id: "solo", folderPath: "solo" }],
      [work("solo", "2026-09-27", HOUR)],
      NOW,
    );
    strictEqual(hours.byAgent.get("solo"), HOUR);
  });
});

describe("hoursAvailable", () => {
  it("is on only when the gateway advertises computeUsage: true", () => {
    strictEqual(hoursAvailable(null), false);
    strictEqual(hoursAvailable(undefined), false);
    strictEqual(hoursAvailable({ computeUsage: false } as never), false);
    strictEqual(hoursAvailable({ computeUsage: true } as never), true);
  });
});
