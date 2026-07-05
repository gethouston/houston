import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { DEFAULT_RUN_HISTORY_LABELS } from "../src/labels.ts";
import { dayStamp, formatRunTime } from "../src/run-time-format.ts";

/**
 * Today/Yesterday bucketing must be CALENDAR days in the SAME zone the clock
 * renders in — elapsed-24h buckets let the label contradict the displayed
 * time (a run late last night labeled Today, a 26h-old run labeled Yesterday
 * across two calendar days).
 */

describe("dayStamp", () => {
  it("resolves the calendar day in the given zone", () => {
    const d = new Date("2026-07-05T05:00:00Z");
    // 05:00 UTC is still July 4 in Los Angeles, already July 5 in UTC.
    assert.equal(
      dayStamp(d, "America/Los_Angeles"),
      Date.parse("2026-07-04T00:00:00Z"),
    );
    assert.equal(dayStamp(d, "UTC"), Date.parse("2026-07-05T00:00:00Z"));
  });
});

describe("formatRunTime", () => {
  const labels = DEFAULT_RUN_HISTORY_LABELS;

  it("labels a run from late last night 'Yesterday' in the display zone (elapsed < 24h)", () => {
    // Run: Jul 4, 10:00 PM PDT. Viewed: Jul 5, 1:00 PM PDT — 15h elapsed, but
    // yesterday on the LA calendar the timestamp renders in.
    const out = formatRunTime(
      "2026-07-05T05:00:00Z",
      labels,
      "en-US",
      "America/Los_Angeles",
      new Date("2026-07-05T20:00:00Z"),
    );
    assert.equal(out, "Yesterday, 10:00 PM");
  });

  it("labels a same-calendar-day run 'Today'", () => {
    const out = formatRunTime(
      "2026-07-05T16:00:00Z", // Jul 5, 9:00 AM PDT
      labels,
      "en-US",
      "America/Los_Angeles",
      new Date("2026-07-05T20:00:00Z"),
    );
    assert.equal(out, "Today, 9:00 AM");
  });

  it("does not call a 26h-old run 'Yesterday' when it is two calendar days back", () => {
    // Run: Jul 4, 11:00 PM UTC. Viewed: Jul 6, 1:00 AM UTC — 26h elapsed but
    // two calendar days in the display zone.
    const out = formatRunTime(
      "2026-07-04T23:00:00Z",
      labels,
      "en-US",
      "UTC",
      new Date("2026-07-06T01:00:00Z"),
    );
    assert.equal(out, "Jul 4, 11:00 PM");
  });
});
