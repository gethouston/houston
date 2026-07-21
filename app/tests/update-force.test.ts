import { ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  FOCUS_RECHECK_MIN_GAP_MS,
  FORCED_UPDATE_COUNTDOWN_SECONDS,
  forcedUpdateMode,
  shouldRecheckOnFocus,
  tickCountdown,
  UPDATE_CHECK_INTERVAL_MS,
} from "../src/lib/update-force.ts";

// The forced presentation follows the find, not the release: a launch-check
// find auto-installs behind the upgrading overlay, anything later gets the
// countdown so the user is never yanked out of work without warning.
describe("forcedUpdateMode", () => {
  it("installs immediately for a launch-check find", () => {
    strictEqual(forcedUpdateMode("launch"), "launch");
  });

  it("counts down for a mid-session find", () => {
    strictEqual(forcedUpdateMode("poll"), "countdown");
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

describe("tickCountdown", () => {
  it("counts down by one second", () => {
    strictEqual(tickCountdown(FORCED_UPDATE_COUNTDOWN_SECONDS), 59);
  });

  it("reaches zero", () => {
    strictEqual(tickCountdown(1), 0);
  });

  it("floors at zero so a late timer never goes negative", () => {
    strictEqual(tickCountdown(0), 0);
  });
});

describe("cadence sanity", () => {
  it("gives the user a real countdown", () => {
    ok(FORCED_UPDATE_COUNTDOWN_SECONDS >= 20);
  });

  it("polls more often than it throttles focus rechecks", () => {
    ok(UPDATE_CHECK_INTERVAL_MS > FOCUS_RECHECK_MIN_GAP_MS);
  });
});
