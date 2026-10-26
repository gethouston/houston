import { HoustonEngineError } from "@houston/engine-adapter/client";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ track: vi.fn(), report: vi.fn() }));
vi.mock("../../../app/src/lib/analytics", () => ({
  analytics: { track: mocks.track },
}));
vi.mock("../../../app/src/lib/error-report", () => ({
  logAndReportError: mocks.report,
}));

import { reportWorkspacePreferenceError } from "../../../app/src/lib/workspace-preference-error";

beforeEach(() => vi.clearAllMocks());
it("reports a billing refusal once without sending it to Sentry", () => {
  for (let i = 0; i < 2; i++)
    reportWorkspacePreferenceError(
      "write",
      new HoustonEngineError(403, { error: "needs_upgrade" }),
    );
  expect(mocks.report).not.toHaveBeenCalled();
  expect(mocks.track).toHaveBeenCalledTimes(1);
});
it("reports repeated unexpected preference failures once", () => {
  for (let i = 0; i < 2; i++)
    reportWorkspacePreferenceError("write", new Error("broken preference"));
  expect(mocks.report).toHaveBeenCalledTimes(1);
});
it("never reports a signed-out selection read to Sentry", () => {
  reportWorkspacePreferenceError(
    "read",
    new HoustonEngineError(401, { error: "signed_out" }),
  );
  expect(mocks.report).not.toHaveBeenCalled();
});

it("separates causes already unwrapped by the adapter for dedupe and analytics", () => {
  reportWorkspacePreferenceError("read", new TypeError("Failed to fetch"));
  reportWorkspacePreferenceError("read", new Error("permission denied"));
  expect(
    mocks.track.mock.calls.map(([, details]) => details.error_kind),
  ).toEqual(["network", "permission"]);
  expect(mocks.report).toHaveBeenCalledTimes(1);
});
it("a non-billing 403 is unexpected", () => {
  reportWorkspacePreferenceError(
    "write",
    new HoustonEngineError(403, { error: "permission denied r4" }),
  );
  expect(mocks.report).toHaveBeenCalledTimes(1);
});
it("a boot 503 is connectivity without Sentry", () => {
  reportWorkspacePreferenceError(
    "read",
    new HoustonEngineError(503, { error: "unavailable r4" }),
  );
  expect(mocks.report).not.toHaveBeenCalled();
});
