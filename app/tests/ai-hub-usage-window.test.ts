import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ProviderUsageWindow } from "@houston-ai/engine-client";
import {
  formatReadingAge,
  settleUsageWindow,
} from "../src/components/ai-hub/provider-usage-window.ts";

describe("settleUsageWindow", () => {
  const now = Date.parse("2026-09-10T13:46:00Z");
  const live: ProviderUsageWindow = {
    id: "session",
    usedPercent: 49,
    resetsAt: "2026-09-10T18:40:00Z",
    windowMinutes: 300,
  };

  it("keeps a live window as the engine reported it", () => {
    strictEqual(settleUsageWindow(live, now), live);
  });

  it("keeps a window with no reset instant, and one with a junk instant", () => {
    const noReset = { ...live, resetsAt: null };
    strictEqual(settleUsageWindow(noReset, now), noReset);
    const junk = { ...live, resetsAt: "garbage" };
    strictEqual(settleUsageWindow(junk, now), junk);
  });

  it("draws a window whose reset has passed as empty, not as its last percent", () => {
    // The stuck strip: "49% used" with no reset note, hours after the 5h window
    // reset. The reset note was already omitted for a past instant; the bar and
    // percent must roll over with it.
    deepStrictEqual(
      settleUsageWindow({ ...live, resetsAt: "2026-09-10T07:00:00Z" }, now),
      { id: "session", usedPercent: 0, resetsAt: null, windowMinutes: 300 },
    );
    deepStrictEqual(
      settleUsageWindow({ ...live, resetsAt: "2026-09-10T13:46:00Z" }, now),
      { id: "session", usedPercent: 0, resetsAt: null, windowMinutes: 300 },
    );
  });
});

describe("formatReadingAge", () => {
  const now = Date.parse("2026-09-10T13:46:00Z");

  it("localizes the age at minute/hour/day granularity", () => {
    strictEqual(
      formatReadingAge(Date.parse("2026-09-10T13:40:00Z"), "en", now),
      "6 minutes ago",
    );
    strictEqual(
      formatReadingAge(Date.parse("2026-09-10T08:46:00Z"), "en", now),
      "5 hours ago",
    );
    strictEqual(
      formatReadingAge(Date.parse("2026-09-07T13:46:00Z"), "en", now),
      "3 days ago",
    );
  });

  it("never says 0 minutes, and answers null for a junk instant", () => {
    strictEqual(formatReadingAge(now, "en", now), "1 minute ago");
    strictEqual(formatReadingAge(0, "en", now), null);
    strictEqual(formatReadingAge(Number.NaN, "en", now), null);
  });
});
