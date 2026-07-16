import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ComputeUsageRow } from "@houston-ai/engine-client";
import {
  bucketCompute,
  durationParts,
  showComputeSection,
} from "../src/components/usage-view/compute-usage-model.ts";

function row(
  agentSlug: string,
  day: string,
  awakeMs: number,
  turns = 0,
  routineRuns = 0,
): ComputeUsageRow {
  return { agentSlug, day, awakeMs, activeMs: 0, wakes: 1, turns, routineRuns };
}

// A fixed Wednesday noon UTC.
const NOW = Date.UTC(2026, 6, 15, 12, 0, 0);

describe("bucketCompute", () => {
  it("zero-fills 7 daily buckets ending today (UTC) for the week range", () => {
    const model = bucketCompute(
      [row("sales", "2026-07-15", 3_600_000, 2, 1)],
      "week",
      NOW,
    );
    strictEqual(model.buckets.length, 7);
    strictEqual(model.buckets[0].startDay, "2026-07-09");
    strictEqual(model.buckets[6].startDay, "2026-07-15");
    deepStrictEqual(
      model.buckets.map((b) => b.runMs),
      [0, 0, 0, 0, 0, 0, 3_600_000],
    );
    strictEqual(model.buckets[6].tasks, 3);
  });

  it("excludes rows before the range and folds future-dated rows into the last bucket", () => {
    const model = bucketCompute(
      [
        row("sales", "2026-07-08", 999), // day before the 7-day window
        row("sales", "2026-07-16", 1_000), // clock-skewed "tomorrow"
      ],
      "week",
      NOW,
    );
    strictEqual(model.totalRunMs, 1_000);
    strictEqual(model.buckets[6].runMs, 1_000);
  });

  it("uses 30 daily buckets for the month range", () => {
    const model = bucketCompute([], "month", NOW);
    strictEqual(model.buckets.length, 30);
    strictEqual(model.buckets[0].startDay, "2026-06-16");
    strictEqual(model.buckets[29].startDay, "2026-07-15");
  });

  it("rolls the quarter range into 13 Monday-aligned weekly buckets", () => {
    const model = bucketCompute(
      [
        row("sales", "2026-07-13", 100), // Monday of the current week
        row("sales", "2026-07-15", 23), // same week -> same bucket
        row("sales", "2026-07-12", 7), // Sunday -> the PREVIOUS week
      ],
      "quarter",
      NOW,
    );
    strictEqual(model.buckets.length, 13);
    const last = model.buckets[12];
    strictEqual(last.startDay, "2026-07-13");
    strictEqual(last.days, 7);
    strictEqual(last.runMs, 123);
    strictEqual(model.buckets[11].runMs, 7);
  });

  it("aggregates per agent, busiest first with slug tie-break", () => {
    const model = bucketCompute(
      [
        row("b-agent", "2026-07-14", 50, 1, 0),
        row("a-agent", "2026-07-14", 50, 0, 2),
        row("big", "2026-07-15", 900, 3, 0),
      ],
      "week",
      NOW,
    );
    deepStrictEqual(
      model.perAgent.map((a) => a.agentSlug),
      ["big", "a-agent", "b-agent"],
    );
    deepStrictEqual(
      model.perAgent.map((a) => a.tasks),
      [3, 2, 1],
    );
    strictEqual(model.totalRunMs, 1_000);
    strictEqual(model.totalTasks, 6);
  });

  it("floors bar maxima at 1 so empty data never divides by zero", () => {
    const model = bucketCompute([], "week", NOW);
    strictEqual(model.maxBucketMs, 1);
    strictEqual(model.maxAgentMs, 1);
  });
});

describe("durationParts", () => {
  it("classifies zero, sub-minute, minutes, and hours with padded minutes", () => {
    deepStrictEqual(durationParts(0), { kind: "zero" });
    deepStrictEqual(durationParts(30_000), { kind: "underMinute" });
    deepStrictEqual(durationParts(45 * 60_000), {
      kind: "minutes",
      minutes: 45,
    });
    deepStrictEqual(durationParts(125 * 60_000), {
      kind: "hoursMinutes",
      hours: 2,
      minutes: "05",
    });
    // No day rollover: 25h stays hours.
    deepStrictEqual(durationParts(25 * 3_600_000), {
      kind: "hoursMinutes",
      hours: 25,
      minutes: "00",
    });
  });

  it("rounds 59.6 minutes up into the hours form, never '60m'", () => {
    deepStrictEqual(durationParts(59 * 60_000 + 36_000), {
      kind: "hoursMinutes",
      hours: 1,
      minutes: "00",
    });
  });
});

describe("showComputeSection", () => {
  it("is on only when the gateway advertises computeUsage: true", () => {
    strictEqual(showComputeSection(null), false);
    strictEqual(showComputeSection(undefined), false);
    strictEqual(showComputeSection({ computeUsage: false } as never), false);
    strictEqual(showComputeSection({ computeUsage: true } as never), true);
  });
});
