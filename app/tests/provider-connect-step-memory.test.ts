import { strictEqual } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import {
  cancelProviderConnectStep,
  claimProviderConnectStepResume,
  forgetProviderConnectSteps,
  providerConnectStepCancelled,
  resumeProviderConnectStep,
} from "../src/lib/provider-connect-step-memory.ts";

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

describe("provider connect resume", () => {
  it("lets the first card resume the conversation", () => {
    strictEqual(claimProviderConnectStepResume("p1"), true);
  });

  it("refuses a second resume for the same step", () => {
    // The nudge starts a turn, whose refetch rebuilds the card on a connected
    // provider. Held in a per-mount ref, the rebuilt card nudged again, and
    // each nudge rebuilt the card: the agent was resumed in a loop.
    claimProviderConnectStepResume("p1");
    strictEqual(claimProviderConnectStepResume("p1"), false);
  });

  it("holds a resume against only the step that connected", () => {
    claimProviderConnectStepResume("p1");
    strictEqual(claimProviderConnectStepResume("p2"), true);
  });

  it("keeps the resume claimed across a restart of the observation", () => {
    // Restarting the WATCH (the user pressed Connect again) never re-arms a
    // nudge that already went out — only a new step does.
    claimProviderConnectStepResume("p1");
    resumeProviderConnectStep("p1");
    strictEqual(claimProviderConnectStepResume("p1"), false);
  });
});
