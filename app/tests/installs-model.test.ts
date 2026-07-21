import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { CreatorInstallRow } from "@houston-ai/engine-client";
import {
  buildInstallsModel,
  clampDays,
  MAX_ANALYTICS_DAYS,
} from "../src/components/store-view/analytics/installs-model.ts";

function row(
  agentId: string,
  day: string,
  installs: number,
  slug: string | null = agentId,
): CreatorInstallRow {
  return { agentId, slug, day, installs };
}

// A fixed Wednesday noon UTC.
const NOW = Date.UTC(2026, 6, 15, 12, 0, 0);

describe("clampDays", () => {
  it("keeps the requested window inside [1, 90]", () => {
    strictEqual(clampDays(7), 7);
    strictEqual(clampDays(90), 90);
    strictEqual(clampDays(200), MAX_ANALYTICS_DAYS);
    strictEqual(clampDays(0), 1);
    strictEqual(clampDays(-5), 1);
    strictEqual(clampDays(12.9), 12);
    strictEqual(clampDays(Number.NaN), MAX_ANALYTICS_DAYS);
  });
});

describe("buildInstallsModel", () => {
  it("zero-fills the daily series ending today (UTC) for the 7-day window", () => {
    const model = buildInstallsModel([row("a", "2026-07-15", 3)], 7, NOW);
    strictEqual(model.buckets.length, 7);
    strictEqual(model.buckets[0].day, "2026-07-09");
    strictEqual(model.buckets[6].day, "2026-07-15");
    deepStrictEqual(
      model.buckets.map((b) => b.installs),
      [0, 0, 0, 0, 0, 0, 3],
    );
  });

  it("sizes the window to the requested range", () => {
    strictEqual(buildInstallsModel([], 30, NOW).buckets.length, 30);
    strictEqual(buildInstallsModel([], 90, NOW).buckets.length, 90);
    // Over the ceiling clamps to 90 days.
    strictEqual(buildInstallsModel([], 365, NOW).buckets.length, 90);
  });

  it("excludes rows before the window and folds future-dated rows into today", () => {
    const model = buildInstallsModel(
      [
        row("a", "2026-07-08", 99), // day before the 7-day window
        row("a", "2026-07-15", 2),
        row("a", "2026-07-16", 5), // clock-skewed "tomorrow"
      ],
      7,
      NOW,
    );
    // The out-of-window row is dropped; the future row lands on today.
    strictEqual(model.buckets[6].installs, 7);
    strictEqual(model.totalInstalls, 7);
  });

  it("rolls up per-agent totals, busiest first, and preserves a slug", () => {
    const model = buildInstallsModel(
      [
        row("a", "2026-07-14", 2, null),
        row("a", "2026-07-15", 1, "alpha"),
        row("b", "2026-07-15", 10, "beta"),
      ],
      7,
      NOW,
    );
    deepStrictEqual(
      model.perAgent.map((agent) => [
        agent.agentId,
        agent.slug,
        agent.installs,
      ]),
      [
        ["b", "beta", 10],
        ["a", "alpha", 3],
      ],
    );
    strictEqual(model.totalInstalls, 13);
    strictEqual(model.maxBucketInstalls, 11);
    strictEqual(model.maxAgentInstalls, 10);
  });

  it("floors the maxes at 1 for an empty window so bar math is safe", () => {
    const model = buildInstallsModel([], 7, NOW);
    strictEqual(model.totalInstalls, 0);
    strictEqual(model.maxBucketInstalls, 1);
    strictEqual(model.maxAgentInstalls, 1);
    strictEqual(model.perAgent.length, 0);
  });

  it("ignores rows with an unparseable day", () => {
    const model = buildInstallsModel(
      [row("a", "not-a-date", 4), row("a", "2026-07-15", 6)],
      7,
      NOW,
    );
    strictEqual(model.totalInstalls, 6);
  });

  it("keeps the total equal to the sum of the charted buckets", () => {
    const model = buildInstallsModel(
      [
        row("a", "2026-07-11", 4),
        row("b", "2026-07-13", 3),
        row("a", "2026-07-15", 8),
      ],
      7,
      NOW,
    );
    const charted = model.buckets.reduce((sum, b) => sum + b.installs, 0);
    strictEqual(model.totalInstalls, charted);
    strictEqual(model.totalInstalls, 15);
  });
});
