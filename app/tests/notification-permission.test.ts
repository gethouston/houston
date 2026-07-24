import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  mapBrowserPermission,
  notificationRowState,
  shouldRecordMissedPing,
  shouldShowCatchNet,
  shouldShowFirstMissionPrompt,
} from "../src/lib/notification-permission.ts";

describe("mapBrowserPermission", () => {
  it("maps granted / denied through, everything else to default", () => {
    strictEqual(mapBrowserPermission("granted"), "granted");
    strictEqual(mapBrowserPermission("denied"), "denied");
    strictEqual(mapBrowserPermission("default"), "default");
  });
});

describe("notificationRowState", () => {
  it("in-app OFF wins regardless of OS truth", () => {
    strictEqual(
      notificationRowState({
        inAppEnabled: false,
        osGranted: true,
        isWeb: false,
      }),
      "offInApp",
    );
    strictEqual(
      notificationRowState({
        inAppEnabled: false,
        osGranted: false,
        isWeb: true,
      }),
      "offInApp",
    );
  });

  it("in-app ON + granted reads On", () => {
    strictEqual(
      notificationRowState({
        inAppEnabled: true,
        osGranted: true,
        isWeb: false,
      }),
      "on",
    );
  });

  it("in-app ON but blocked distinguishes desktop from browser", () => {
    strictEqual(
      notificationRowState({
        inAppEnabled: true,
        osGranted: false,
        isWeb: false,
      }),
      "osBlocked",
    );
    strictEqual(
      notificationRowState({
        inAppEnabled: true,
        osGranted: false,
        isWeb: true,
      }),
      "browserBlocked",
    );
  });
});

describe("shouldShowFirstMissionPrompt", () => {
  it("shows only when not granted and never asked", () => {
    strictEqual(
      shouldShowFirstMissionPrompt({ osGranted: false, askedBefore: false }),
      true,
    );
  });
  it("never shows once granted", () => {
    strictEqual(
      shouldShowFirstMissionPrompt({ osGranted: true, askedBefore: false }),
      false,
    );
  });
  it("never shows twice", () => {
    strictEqual(
      shouldShowFirstMissionPrompt({ osGranted: false, askedBefore: true }),
      false,
    );
  });
});

describe("shouldRecordMissedPing", () => {
  it("records only when wanted but undeliverable", () => {
    strictEqual(
      shouldRecordMissedPing({ inAppEnabled: true, osGranted: false }),
      true,
    );
  });
  it("does not record a deliberate in-app silence", () => {
    strictEqual(
      shouldRecordMissedPing({ inAppEnabled: false, osGranted: false }),
      false,
    );
  });
  it("does not record when the ping would have been delivered", () => {
    strictEqual(
      shouldRecordMissedPing({ inAppEnabled: true, osGranted: true }),
      false,
    );
  });
});

describe("shouldShowCatchNet", () => {
  it("shows a pending, undismissed miss while still ungranted", () => {
    strictEqual(
      shouldShowCatchNet({
        missedPingPending: true,
        dismissed: false,
        osGranted: false,
      }),
      true,
    );
  });
  it("never shows once dismissed", () => {
    strictEqual(
      shouldShowCatchNet({
        missedPingPending: true,
        dismissed: true,
        osGranted: false,
      }),
      false,
    );
  });
  it("never shows once granted", () => {
    strictEqual(
      shouldShowCatchNet({
        missedPingPending: true,
        dismissed: false,
        osGranted: true,
      }),
      false,
    );
  });
  it("nothing to show with no pending miss", () => {
    strictEqual(
      shouldShowCatchNet({
        missedPingPending: false,
        dismissed: false,
        osGranted: false,
      }),
      false,
    );
  });
});
