import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  onboardingPendingValue,
  parseOnboardingPending,
} from "../src/lib/onboarding-pending.ts";
import {
  isFirstRun,
  type OnboardingRouteInputs,
  onboardingRoute,
} from "../src/lib/onboarding-route.ts";

describe("isFirstRun (per-wire first-run signal)", () => {
  it("legacy Rust wire: zero workspaces = first run, agents irrelevant", () => {
    strictEqual(
      isFirstRun({ controlPlane: false, workspaceCount: 0, agentCount: 5 }),
      true,
    );
    strictEqual(
      isFirstRun({ controlPlane: false, workspaceCount: 1, agentCount: 0 }),
      false,
    );
  });

  it("v3 control plane: zero agents = first run, despite the synthetic workspace", () => {
    strictEqual(
      isFirstRun({ controlPlane: true, workspaceCount: 1, agentCount: 0 }),
      true,
    );
    strictEqual(
      isFirstRun({ controlPlane: true, workspaceCount: 1, agentCount: 3 }),
      false,
    );
  });
});

describe("onboardingRoute (first-run gate)", () => {
  // A genuine, uncompleted first run that can create agents, with nothing
  // answered or connected yet. Each test overrides only what it exercises.
  const base: OnboardingRouteInputs = {
    firstRun: true,
    pendingStage: "none",
    onboardingCompleted: false,
    canCreateAgents: true,
    capabilitiesError: false,
    surveyAnswered: false,
    aiConnected: false,
  };

  it("fresh install walks survey, then connect AI, then team", () => {
    strictEqual(onboardingRoute(base), "survey");
    strictEqual(
      onboardingRoute({ ...base, surveyAnswered: true }),
      "connectAi",
    );
    strictEqual(
      onboardingRoute({ ...base, surveyAnswered: true, aiConnected: true }),
      "team",
    );
  });

  it("an already-connected provider skips straight to the team card", () => {
    strictEqual(
      onboardingRoute({ ...base, surveyAnswered: true, aiConnected: true }),
      "team",
    );
  });

  it("the survey comes first even when a provider is connected", () => {
    strictEqual(onboardingRoute({ ...base, aiConnected: true }), "survey");
  });

  it("the pending flag holds the team card after the first hire flips firstRun", () => {
    strictEqual(
      onboardingRoute({
        ...base,
        firstRun: false,
        pendingStage: "started",
        surveyAnswered: true,
        aiConnected: true,
      }),
      "team",
    );
  });

  it("the pending flag outranks a completed flag (mid-flight resume)", () => {
    strictEqual(
      onboardingRoute({
        ...base,
        firstRun: false,
        pendingStage: "started",
        onboardingCompleted: true,
        surveyAnswered: true,
      }),
      "connectAi",
    );
  });

  it("a run that reached the team card stays there when the provider drops", () => {
    strictEqual(
      onboardingRoute({
        ...base,
        firstRun: false,
        pendingStage: "team",
        surveyAnswered: true,
        aiConnected: false,
      }),
      "team",
    );
  });

  it("a stale in-app tutorial flag never pulls an account with employees back in", () => {
    // The in-app tutorial stored "1" in the same preference. Its accounts
    // already have AI Employees and no first run to resume.
    strictEqual(
      onboardingRoute({
        ...base,
        firstRun: false,
        pendingStage: parseOnboardingPending("1"),
      }),
      "app",
    );
  });

  it("a resumed onboarding with an unanswered survey re-asks it", () => {
    strictEqual(
      onboardingRoute({ ...base, firstRun: false, pendingStage: "started" }),
      "survey",
    );
  });

  it("finishing the team card (pending cleared, completed set) lands in the app", () => {
    strictEqual(
      onboardingRoute({
        ...base,
        firstRun: true,
        onboardingCompleted: true,
        surveyAnswered: true,
        aiConnected: true,
      }),
      "app",
    );
  });

  it("a completed account with zero agents stays in the app", () => {
    strictEqual(onboardingRoute({ ...base, onboardingCompleted: true }), "app");
  });

  it("can't create agents (multiplayer member) goes straight to the app", () => {
    strictEqual(
      onboardingRoute({
        ...base,
        pendingStage: "started",
        canCreateAgents: false,
      }),
      "app",
    );
  });

  it("a capabilities fetch error fails closed into the app", () => {
    strictEqual(
      onboardingRoute({
        ...base,
        pendingStage: "started",
        capabilitiesError: true,
      }),
      "app",
    );
  });

  it("not a first run and nothing pending lands in the app", () => {
    strictEqual(onboardingRoute({ ...base, firstRun: false }), "app");
  });
});

describe("onboarding_pending preference value", () => {
  it("round-trips each stage", () => {
    for (const stage of ["none", "started", "team"] as const) {
      strictEqual(parseOnboardingPending(onboardingPendingValue(stage)), stage);
    }
  });

  it("reads absent, blank and unknown values as nothing pending", () => {
    strictEqual(parseOnboardingPending(null), "none");
    strictEqual(parseOnboardingPending(""), "none");
    strictEqual(parseOnboardingPending("1"), "none");
  });
});
