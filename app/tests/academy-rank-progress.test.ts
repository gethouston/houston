import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  ACADEMY_RANK_LABELS,
  academyRankReading,
} from "../src/components/academy/academy-rank-progress.ts";
import {
  ACADEMY_RANKS,
  currentRank,
} from "../src/lib/academy/academy-ranks.ts";

/**
 * The reading the Academy's status header spends: the ring drawn around the
 * user's own face and the meter beside it. One function, so the arc and the
 * bar can never claim different fractions of one climb.
 */
describe("academyRankReading", () => {
  it("starts a fresh cadet at the bottom of the climb, with the whole gap owed", () => {
    const reading = academyRankReading(0, currentRank(0, 0));
    strictEqual(reading.next?.id, "pilot");
    strictEqual(reading.percent, 0);
    strictEqual(reading.remaining, 50);
  });

  it("measures the climb between the two rungs, not from zero", () => {
    // Pilot spans 50 to 150, so 100 experience is a quarter of the way up,
    // never the two thirds a from-zero reading would claim.
    const reading = academyRankReading(100, currentRank(100, 0));
    strictEqual(reading.next?.id, "specialist");
    strictEqual(reading.percent, 50);
    strictEqual(reading.remaining, 50);
  });

  it("is full and owes nothing at the top of the ladder", () => {
    const top = ACADEMY_RANKS[ACADEMY_RANKS.length - 1];
    const reading = academyRankReading(top.minExperience, top);
    strictEqual(reading.next, null);
    strictEqual(reading.percent, 100);
    strictEqual(reading.remaining, 0);
  });

  it("never reads past either end, whatever the stored totals say", () => {
    // A record edited by hand (or a threshold moved under a saved total) must
    // still produce a ring that can be drawn.
    const cadet = currentRank(0, 0);
    strictEqual(academyRankReading(-100, cadet).percent, 0);
    strictEqual(academyRankReading(9999, cadet).percent, 100);
    strictEqual(academyRankReading(9999, cadet).remaining, 0);
  });

  it("names every rung on the ladder", () => {
    // A rank added without its string would render its raw id to the user.
    for (const rank of ACADEMY_RANKS) {
      strictEqual(typeof ACADEMY_RANK_LABELS[rank.id], "string");
    }
  });
});
