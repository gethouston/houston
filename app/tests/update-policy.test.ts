import { ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  downloadAttemptBudget,
  FOCUS_RECHECK_MIN_GAP_MS,
  LAUNCH_DOWNLOAD_ATTEMPTS,
  nextCheckFailureStreak,
  POLL_DOWNLOAD_ATTEMPTS,
  shouldRecheckOnFocus,
  shouldReportDownloadFailure,
  shouldSkipDownload,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_CHECK_STUCK_THRESHOLD,
  updateCheckJustStuck,
  updatePresentation,
} from "../src/lib/update-policy.ts";
import type { UpdateInfo, UpdateStatus } from "../src/lib/update-status.ts";

const found = (origin: UpdateInfo["origin"]): UpdateInfo => ({
  currentVersion: "0.6.23",
  version: "1.0.8",
  origin,
});

function statuses(
  origin: UpdateInfo["origin"],
): Record<string, Exclude<UpdateStatus, { state: "idle" }>> {
  const info = found(origin);
  return {
    available: { state: "available", info },
    downloading: { state: "downloading", info, progress: 40 },
    downloaded: { state: "downloaded", info },
    installing: { state: "installing", info },
    errorDownload: { state: "error", info, phase: "download" },
    errorInstall: { state: "error", info, phase: "install" },
    errorRelaunch: { state: "error", info, phase: "relaunch" },
  };
}

describe("updatePresentation", () => {
  it("keeps a launch-check find behind the overlay in every state", () => {
    for (const status of Object.values(statuses("launch"))) {
      strictEqual(updatePresentation(status), "launch", status.state);
    }
  });

  it("keeps a mid-session find in the background in every state", () => {
    for (const status of Object.values(statuses("poll"))) {
      strictEqual(updatePresentation(status), "background", status.state);
    }
  });

  it("covers a return's install, but sends its error to the pill", () => {
    const byState = statuses("return");
    strictEqual(updatePresentation(byState.installing), "launch");
    strictEqual(updatePresentation(byState.errorInstall), "background");
    strictEqual(updatePresentation(byState.errorRelaunch), "background");
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

describe("downloadAttemptBudget", () => {
  it("gives a launch find the first request and one resume", () => {
    strictEqual(downloadAttemptBudget("launch"), LAUNCH_DOWNLOAD_ATTEMPTS);
    strictEqual(LAUNCH_DOWNLOAD_ATTEMPTS, 2);
  });

  it("lets a background poll use the whole ladder", () => {
    strictEqual(downloadAttemptBudget("poll"), POLL_DOWNLOAD_ATTEMPTS);
    ok(POLL_DOWNLOAD_ATTEMPTS > LAUNCH_DOWNLOAD_ATTEMPTS);
  });
});

describe("shouldSkipDownload", () => {
  it("skips the release the disk refused for the automatic triggers", () => {
    strictEqual(shouldSkipDownload("1.0.6", "1.0.6", "poll"), true);
    strictEqual(shouldSkipDownload("1.0.6", "1.0.6", "launch"), true);
  });

  it("never skips the person's own retry", () => {
    strictEqual(shouldSkipDownload("1.0.6", "1.0.6", "user"), false);
  });

  it("tries a newer release afresh", () => {
    strictEqual(shouldSkipDownload("1.0.6", "1.0.7", "poll"), false);
    strictEqual(shouldSkipDownload(null, "1.0.6", "poll"), false);
  });
});
