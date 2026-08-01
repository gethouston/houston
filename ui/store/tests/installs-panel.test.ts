import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { toInstallsDayBars } from "../src/components/installs-panel";

describe("toInstallsDayBars", () => {
  it("rolls per-(agent, day) rows up to ascending per-day totals", () => {
    const bars = toInstallsDayBars([
      { day: "2026-07-30", installs: 2 },
      { day: "2026-07-29", installs: 1 },
      { day: "2026-07-30", installs: 2 },
    ]);
    deepStrictEqual(
      bars.map((bar) => [bar.day, bar.installs]),
      [
        ["2026-07-29", 1],
        ["2026-07-30", 4],
      ],
    );
    strictEqual(bars[1]?.fraction, 1);
    strictEqual(bars[0]?.fraction, 0.25);
  });

  it("returns an empty series for an empty window", () => {
    deepStrictEqual(toInstallsDayBars([]), []);
  });
});
