import { strictEqual } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import {
  cancelProviderConnectStep,
  forgetProviderConnectSteps,
  providerConnectStepCancelled,
  resumeProviderConnectStep,
} from "../src/lib/provider-connect-cancellation.ts";

beforeEach(() => forgetProviderConnectSteps());

describe("provider connect cancellation", () => {
  it("treats a step nobody cancelled as live", () => {
    strictEqual(providerConnectStepCancelled("p1"), false);
  });

  it("keeps a cancelled step paused across a remount", () => {
    // The mount that cancelled is gone (the user switched conversation and came
    // back, or reloaded). A per-mount ref forgot, and the rebuilt monitor
    // auto-resumed on a sign-in that landed AFTER the cancel; the step id
    // outlives the mount, so the pause does too.
    cancelProviderConnectStep("p1");
    strictEqual(providerConnectStepCancelled("p1"), true);
  });

  it("pauses only the step the user cancelled", () => {
    cancelProviderConnectStep("p1");
    strictEqual(providerConnectStepCancelled("p2"), false);
  });

  it("resumes a step the user explicitly restarts", () => {
    cancelProviderConnectStep("p1");
    resumeProviderConnectStep("p1");
    strictEqual(providerConnectStepCancelled("p1"), false);
  });
});
