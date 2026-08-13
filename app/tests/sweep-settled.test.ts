import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { sweepSettled } from "../src/lib/sweep-settled.ts";

/** A settled sweep over a loaded roster with data in hand and nothing in
 *  flight — the one reading a baseline may be taken from. */
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
    // Nothing will ever be asked, so a watcher must not wait forever.
    strictEqual(
      sweepSettled({ ...settled, agentCount: 0, hasData: false }),
      true,
    );
  });

  it("never settles on a roster that has not loaded yet", () => {
    // The boot gap (and the reset on an identity change) leaves the roster
    // EMPTY but unanswered. Read as settled-at-zero, a lesson beat waiting for
    // a new conversation takes a baseline of 0, sees the user's existing
    // missions as brand new, and pays itself out with no user action at all.
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
