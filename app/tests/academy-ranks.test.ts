import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  ACADEMY_RANKS,
  currentRank,
  nextRank,
} from "../src/lib/academy/academy-ranks.ts";

describe("currentRank", () => {
  it("starts everyone at cadet", () => {
    strictEqual(currentRank(0, 0).id, "cadet");
    // A caller bug (negative totals) must still yield a rank, not a crash.
    strictEqual(currentRank(-10, -10).id, "cadet");
  });

  it("promotes exactly at the threshold, not one point before", () => {
    strictEqual(currentRank(49, 0).id, "cadet");
    strictEqual(currentRank(50, 0).id, "pilot");
    strictEqual(currentRank(149, 0).id, "pilot");
    strictEqual(currentRank(150, 0).id, "specialist");
  });

  it("holds the top ranks behind usage, not reading alone", () => {
    strictEqual(currentRank(300, 0).id, "specialist");
    strictEqual(currentRank(300, 199).id, "specialist");
    strictEqual(currentRank(300, 200).id, "commander");
    strictEqual(currentRank(500, 999).id, "commander");
    strictEqual(currentRank(500, 1000).id, "mission-director");
  });

  it("does not stop at the first unmet rung", () => {
    // Enough usage for the top, but the experience is only specialist-grade.
    strictEqual(currentRank(150, 5000).id, "specialist");
    // Both currencies far past the top: the ladder ends at mission-director.
    strictEqual(currentRank(9999, 9999).id, "mission-director");
  });
});

describe("nextRank", () => {
  it("walks the ladder in order and ends at null", () => {
    const walked: string[] = [];
    let rank = ACADEMY_RANKS[0];
    let next = nextRank(rank);
    while (next) {
      walked.push(next.id);
      rank = next;
      next = nextRank(rank);
    }
    strictEqual(rank.id, "mission-director");
    strictEqual(
      walked.join(","),
      "pilot,specialist,commander,mission-director",
    );
    strictEqual(nextRank(rank), null);
  });

  it("finds the rung by id, not by object identity", () => {
    strictEqual(
      nextRank({
        id: "cadet",
        minExperience: 0,
        minUsagePoints: 0,
      }),
      ACADEMY_RANKS[1],
    );
  });

  it("keeps the ladder ascending in both currencies", () => {
    for (let i = 1; i < ACADEMY_RANKS.length; i++) {
      const prev = ACADEMY_RANKS[i - 1];
      const rank = ACADEMY_RANKS[i];
      strictEqual(rank.minExperience >= prev.minExperience, true);
      strictEqual(rank.minUsagePoints >= prev.minUsagePoints, true);
    }
  });
});
