import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { sweepSettled } from "../src/lib/sweep-settled.ts";

const settled = {
  rosterLoaded: true,
  agentCount: 2,
  hasData: true,
  isFetching: false,
};

describe("sweepSettled", () => {
  it("trusts a sweep that answered for the current roster", () => {
    strictEqual(sweepSettled(settled), true);
  });

  it("withholds an answer while the sweep is still coming", () => {
    strictEqual(sweepSettled({ ...settled, hasData: false }), false);
    strictEqual(sweepSettled({ ...settled, isFetching: true }), false);
  });

  it("settles at once for a roster that really is empty", () => {
    strictEqual(
      sweepSettled({ ...settled, agentCount: 0, hasData: false }),
      true,
    );
  });

  it("never settles on a roster that has not loaded yet", () => {
    strictEqual(
      sweepSettled({
        rosterLoaded: false,
        agentCount: 0,
        hasData: false,
        isFetching: false,
      }),
      false,
    );
    strictEqual(sweepSettled({ ...settled, rosterLoaded: false }), false);
  });
});
