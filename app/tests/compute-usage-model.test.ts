import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ComputeUsageRow } from "@houston-ai/engine-client";
import {
  bucketCompute,
  durationParts,
  onlyKnownAgents,
  showComputeSection,
  withRosterAgents,
} from "../src/components/usage-view/compute-usage-model.ts";

// The displayed metric is time worked (`activeMs`); awake time rides the wire
// but must never leak into the model's numbers, so every row carries a larger
// awakeMs that the assertions would catch.
function row(
  agentSlug: string,
  day: string,
  workMs: number,
  turns = 0,
  routineRuns = 0,
): ComputeUsageRow {
  return {
    agentSlug,
    day,
    awakeMs: workMs * 2 + 1,
    activeMs: workMs,
    wakes: 1,
    turns,
    routineRuns,
  };
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
      model.buckets.map((b) => b.workMs),
      [0, 0, 0, 0, 0, 0, 3_600_000],
    );
    strictEqual(model.buckets[6].messages, 3);
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
    strictEqual(model.totalWorkMs, 1_000);
    strictEqual(model.buckets[6].workMs, 1_000);
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
    strictEqual(last.workMs, 123);
    strictEqual(model.buckets[11].workMs, 7);
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
      model.perAgent.map((a) => a.messages),
      [3, 2, 1],
    );
    strictEqual(model.totalWorkMs, 1_000);
    strictEqual(model.totalMessages, 6);
  });

  it("floors bar maxima at 1 so empty data never divides by zero", () => {
    const model = bucketCompute([], "week", NOW);
    strictEqual(model.maxBucketMs, 1);
    strictEqual(model.maxAgentMs, 1);
  });

  it("keeps zero-work agents in perAgent (the roster merge decides visibility)", () => {
    const idle: ComputeUsageRow = {
      agentSlug: "idle-agent",
      day: "2026-07-15",
      awakeMs: 600_000, // awake the whole time...
      activeMs: 0, // ...but never worked
      wakes: 3,
      turns: 0,
      routineRuns: 0,
    };
    const model = bucketCompute(
      [idle, row("real", "2026-07-15", 1_000, 1)],
      "week",
      NOW,
    );
    deepStrictEqual(
      model.perAgent.map((a) => a.agentSlug),
      ["real", "idle-agent"],
    );
  });
});

describe("withRosterAgents", () => {
  it("lists every roster agent immediately, zeros for those without data", () => {
    const merged = withRosterAgents(
      [
        { id: "Personal/Fresh", folderPath: "fresh" }, // just created, no rows
        { id: "Personal/Worker", folderPath: "worker" },
      ],
      [{ agentSlug: "worker", workMs: 1_000, messages: 3 }],
    );
    deepStrictEqual(merged, [
      { agentSlug: "worker", workMs: 1_000, messages: 3 },
      { agentSlug: "fresh", workMs: 0, messages: 0 },
    ]);
  });

  it("matches totals by folderPath or id and falls back to id as the slug", () => {
    const merged = withRosterAgents(
      [{ id: "Personal/ById" }],
      [{ agentSlug: "Personal/ById", workMs: 42, messages: 1 }],
    );
    deepStrictEqual(merged, [
      { agentSlug: "Personal/ById", workMs: 42, messages: 1 },
    ]);
  });
});

describe("onlyKnownAgents", () => {
  it("keeps only rows whose slug matches a sidebar agent's id or folderPath", () => {
    const agents = [
      { id: "Personal/Assistant", folderPath: "personal-assistant" },
      { id: "Personal/Scout" },
    ];
    const rows = [
      row("personal-assistant", "2026-07-15", 1_000, 1),
      row("Personal/Scout", "2026-07-15", 500, 1),
      row("40e4d673e72e86df", "2026-07-15", 900, 2), // deleted agent
      row("5e70000000000000", "2026-07-15", 0, 0), // system pod
    ];
    deepStrictEqual(
      onlyKnownAgents(rows, agents).map((r) => r.agentSlug),
      ["personal-assistant", "Personal/Scout"],
    );
  });

  it("returns nothing when the roster is empty", () => {
    deepStrictEqual(onlyKnownAgents([row("a", "2026-07-15", 1)], []), []);
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
