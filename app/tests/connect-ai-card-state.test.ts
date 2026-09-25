import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  connectedProviderId,
  onboardingBeats,
  shownOnboardingStep,
} from "../src/components/onboarding/connect-ai-card-state.ts";
import type { OnboardingStep } from "../src/lib/onboarding-route.ts";

const connected = { cli_installed: true, auth_state: "authenticated" as const };
const disconnected = {
  cli_installed: true,
  auth_state: "unauthenticated" as const,
};
const unknown = { cli_installed: true, auth_state: "unknown" as const };

describe("connectedProviderId", () => {
  const settled = { isLoading: false, isError: false };

  it("names the first confirmed connected provider", () => {
    strictEqual(
      connectedProviderId({
        ...settled,
        statuses: { openai: disconnected, anthropic: connected },
      }),
      "anthropic",
    );
  });

  it("an unknown probe is not a connection", () => {
    strictEqual(
      connectedProviderId({ ...settled, statuses: { anthropic: unknown } }),
      null,
    );
  });

  it("no statuses yet reads as nothing connected", () => {
    strictEqual(connectedProviderId({ ...settled, statuses: {} }), null);
  });

  it("a failed re-probe does not vouch for the connection it last saw", () => {
    // The query keeps its last good scan beside the error: the provider may
    // have disconnected since, so the connection is no longer confirmed.
    strictEqual(
      connectedProviderId({
        isLoading: false,
        isError: true,
        statuses: { anthropic: connected },
      }),
      null,
    );
  });

  it("a probe still loading confirms nothing", () => {
    strictEqual(
      connectedProviderId({
        isLoading: true,
        isError: false,
        statuses: { anthropic: connected },
      }),
      null,
    );
  });
});

describe("onboardingBeats", () => {
  const none = new Set<OnboardingStep>();

  it("the connect card reports its step view once", () => {
    deepStrictEqual(
      onboardingBeats({
        previous: "survey",
        current: "connectAi",
        viewed: none,
        providerId: null,
      }),
      [{ event: "onboarding_step_viewed", step: "connectAi" }],
    );
    deepStrictEqual(
      onboardingBeats({
        previous: "survey",
        current: "connectAi",
        viewed: new Set<OnboardingStep>(["connectAi"]),
        providerId: null,
      }),
      [],
    );
  });

  it("the survey reports no step view of its own here", () => {
    deepStrictEqual(
      onboardingBeats({
        previous: null,
        current: "survey",
        viewed: none,
        providerId: null,
      }),
      [],
    );
  });

  it("connect card to team card reports the connection, then the team view", () => {
    deepStrictEqual(
      onboardingBeats({
        previous: "connectAi",
        current: "team",
        viewed: new Set<OnboardingStep>(["connectAi"]),
        providerId: "openai",
      }),
      [
        { event: "ai_provider_connected", provider: "openai" },
        { event: "onboarding_step_viewed", step: "team" },
      ],
    );
  });

  it("arriving on the team card already connected reports no connection", () => {
    deepStrictEqual(
      onboardingBeats({
        previous: "survey",
        current: "team",
        viewed: none,
        providerId: "anthropic",
      }),
      [{ event: "onboarding_step_viewed", step: "team" }],
    );
  });
});

describe("shownOnboardingStep", () => {
  const ready = {
    surveyLoading: false,
    statusesLoading: false,
    hasWorkspace: true,
  };

  it("shows the route's screen once its inputs are ready", () => {
    strictEqual(shownOnboardingStep({ ...ready, step: "survey" }), "survey");
    strictEqual(
      shownOnboardingStep({ ...ready, step: "connectAi" }),
      "connectAi",
    );
    strictEqual(shownOnboardingStep({ ...ready, step: "team" }), "team");
  });

  it("the connect card waits for the first provider probe", () => {
    strictEqual(
      shownOnboardingStep({
        ...ready,
        step: "connectAi",
        statusesLoading: true,
      }),
      null,
    );
  });

  it("the survey waits for its record and the team card for its workspace", () => {
    strictEqual(
      shownOnboardingStep({ ...ready, step: "survey", surveyLoading: true }),
      null,
    );
    strictEqual(
      shownOnboardingStep({ ...ready, step: "team", hasWorkspace: false }),
      null,
    );
  });
});
