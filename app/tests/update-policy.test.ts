import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  FOCUS_RECHECK_MIN_GAP_MS,
  nextCheckFailureStreak,
  shouldRecheckOnFocus,
  shouldReportDownloadFailure,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_CHECK_STUCK_THRESHOLD,
  updateCheckJustStuck,
  updatePresentation,
} from "../src/lib/update-policy.ts";

// The presentation follows the find, not the release: a launch-check find
// installs behind the upgrading overlay (nothing is running yet); anything
// later downloads silently and waits for the user's own restart, so a working
// user is never yanked out of a task.
describe("updatePresentation", () => {
  it("installs immediately for a launch-check find", () => {
    strictEqual(updatePresentation("launch"), "launch");
  });

  it("downloads in the background for a mid-session find", () => {
    strictEqual(updatePresentation("poll"), "background");
  });
});

describe("shouldRecheckOnFocus", () => {
  it("checks when no check has run yet", () => {
    strictEqual(shouldRecheckOnFocus(null, 1_000), true);
  });

  it("suppresses a focus burst right after a check", () => {
    strictEqual(
      shouldRecheckOnFocus(10_000, 10_000 + FOCUS_RECHECK_MIN_GAP_MS - 1),
      false,
    );
  });

  it("checks once the gap has fully elapsed", () => {
    strictEqual(
      shouldRecheckOnFocus(10_000, 10_000 + FOCUS_RECHECK_MIN_GAP_MS),
      true,
    );
  });
});

describe("cadence", () => {
  it("polls every five minutes", () => {
    strictEqual(UPDATE_CHECK_INTERVAL_MS, 5 * 60 * 1000);
  });

  it("throttles focus re-checks to once a minute", () => {
    strictEqual(FOCUS_RECHECK_MIN_GAP_MS, 60 * 1000);
  });
});

// A client that can never reach the release feed is invisible unless the
// failures are counted: the streak trips exactly once per run, and any check
// that completes (found or none) resets it.
describe("nextCheckFailureStreak", () => {
  it("extends the streak on a failure", () => {
    strictEqual(nextCheckFailureStreak(2, "failed"), 3);
  });

  it("resets on a completed check, found or not", () => {
    strictEqual(nextCheckFailureStreak(2, "found"), 0);
    strictEqual(nextCheckFailureStreak(2, "none"), 0);
  });

  it("leaves a skipped check out of the count", () => {
    strictEqual(nextCheckFailureStreak(2, "skipped"), 2);
  });
});

describe("updateCheckJustStuck", () => {
  it("fires exactly when the threshold is first reached", () => {
    strictEqual(updateCheckJustStuck(UPDATE_CHECK_STUCK_THRESHOLD - 1), false);
    strictEqual(updateCheckJustStuck(UPDATE_CHECK_STUCK_THRESHOLD), true);
    strictEqual(updateCheckJustStuck(UPDATE_CHECK_STUCK_THRESHOLD + 1), false);
  });
});

// A failed background download retries every poll; the report must not.
describe("shouldReportDownloadFailure", () => {
  it("reports the first failure for a release", () => {
    strictEqual(shouldReportDownloadFailure(null, "0.6.17"), true);
  });

  it("stays quiet for repeats of the same release", () => {
    strictEqual(shouldReportDownloadFailure("0.6.17", "0.6.17"), false);
  });

  it("reports again when a newer release fails", () => {
    strictEqual(shouldReportDownloadFailure("0.6.17", "0.6.18"), true);
  });
});
