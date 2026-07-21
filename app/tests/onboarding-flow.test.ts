import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type {
  Capabilities,
  IntegrationConnection,
} from "@houston-ai/engine-client";
import {
  integrationsAvailable,
  isFirstRun,
  isToolkitConnected,
  onboardingRoute,
  shouldOfferTeamInvite,
  stepAfterAgentCreated,
} from "../src/components/onboarding/missions/onboarding-flow.ts";

/** A minimal capabilities object with the integrations set under test. */
function caps(integrations: string[]): Capabilities {
  return {
    profile: "cloud",
    revealInOs: false,
    terminal: false,
    tunnel: false,
    codeExecution: "remote-sandbox",
    providers: [],
    openaiCompatible: false,
    integrations,
  };
}

const conn = (
  toolkit: string,
  status: IntegrationConnection["status"],
): IntegrationConnection => ({ toolkit, connectionId: "ca_1", status });

describe("shouldOfferTeamInvite (finish-screen growth card)", () => {
  it("only on a spaces host", () => {
    strictEqual(shouldOfferTeamInvite({ ...caps([]), spaces: true }), true);
    strictEqual(shouldOfferTeamInvite({ ...caps([]), spaces: false }), false);
  });

  it("hidden when spaces is absent (legacy / desktop / self-host)", () => {
    strictEqual(shouldOfferTeamInvite(caps([])), false);
    strictEqual(shouldOfferTeamInvite(null), false);
    strictEqual(shouldOfferTeamInvite(undefined), false);
  });
});

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
    // The adapter always reports one synthetic workspace, so a workspace
    // count of 1 with no agents IS a fresh install there.
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

describe("integrationsAvailable (HOU-653 engine gating)", () => {
  it("true when the composio provider is advertised", () => {
    strictEqual(integrationsAvailable(caps(["composio"])), true);
  });

  it("false when integrations are advertised but not composio", () => {
    strictEqual(integrationsAvailable(caps(["other"])), false);
  });

  it("false when no integrations are advertised", () => {
    strictEqual(integrationsAvailable(caps([])), false);
  });

  it("false on the legacy Rust engine (null capabilities)", () => {
    // The capabilities query is disabled on the legacy wire, so it reads null;
    // we must never route into a step the host can't serve.
    strictEqual(integrationsAvailable(null), false);
    strictEqual(integrationsAvailable(undefined), false);
  });
});

describe("stepAfterAgentCreated", () => {
  it("routes into the email detour when integrations are available", () => {
    strictEqual(stepAfterAgentCreated(caps(["composio"])), "connectEmail");
  });

  it("routes straight to finish when integrations are unavailable", () => {
    strictEqual(stepAfterAgentCreated(caps([])), "finished");
    strictEqual(stepAfterAgentCreated(null), "finished");
  });
});

describe("onboardingRoute (HOU-732 first-run gate)", () => {
  // Defaults: a genuine, uncompleted first run that can create agents and has
  // not yet answered segmentation. Each test overrides only what it exercises.
  const base = {
    firstRun: true,
    onboardingPending: false,
    onboardingCompleted: false,
    canCreateAgents: true,
    capabilitiesError: false,
    segmentAnswered: false,
  };

  it("fresh install: segmentation first, then the create flow once answered", () => {
    strictEqual(onboardingRoute(base), "segment");
    strictEqual(
      onboardingRoute({ ...base, segmentAnswered: true }),
      "onboarding",
    );
  });

  it("interrupted onboarding resumes via the pending flag (skips segment)", () => {
    // Mid-flight the assistant exists, so firstRun is false; the pending flag is
    // what re-enters onboarding, and a resume never re-asks segmentation.
    strictEqual(
      onboardingRoute({
        ...base,
        firstRun: false,
        onboardingPending: true,
        segmentAnswered: false,
      }),
      "onboarding",
    );
  });

  it("migration done: a completed user with zero agents lands in the app", () => {
    // firstRun is true (zero cloud agents) but the flag marks them onboarded, so
    // they must not be dragged back into the create flow or segmentation.
    strictEqual(onboardingRoute({ ...base, onboardingCompleted: true }), "app");
  });

  it("delete-all-agents: a completed user stays in the app, not onboarding", () => {
    strictEqual(
      onboardingRoute({
        ...base,
        onboardingCompleted: true,
        segmentAnswered: true,
      }),
      "app",
    );
  });

  it("can't create agents (multiplayer user) → straight to the app", () => {
    strictEqual(onboardingRoute({ ...base, canCreateAgents: false }), "app");
  });

  it("capabilities fetch error fails closed into the app", () => {
    strictEqual(onboardingRoute({ ...base, capabilitiesError: true }), "app");
  });

  it("not a first run and nothing pending → the app", () => {
    strictEqual(onboardingRoute({ ...base, firstRun: false }), "app");
  });
});

describe("isToolkitConnected (chosen-toolkit match)", () => {
  it("true once the chosen toolkit is active", () => {
    strictEqual(isToolkitConnected([conn("gmail", "active")], "gmail"), true);
  });

  it("false while the chosen toolkit is only pending (OAuth not finished)", () => {
    strictEqual(isToolkitConnected([conn("gmail", "pending")], "gmail"), false);
  });

  it("false when a DIFFERENT toolkit is active", () => {
    strictEqual(
      isToolkitConnected([conn("outlook", "active")], "gmail"),
      false,
    );
  });

  it("false on an errored connection", () => {
    strictEqual(isToolkitConnected([conn("gmail", "error")], "gmail"), false);
  });

  it("false when there are no connections yet (undefined / empty)", () => {
    strictEqual(isToolkitConnected(undefined, "gmail"), false);
    strictEqual(isToolkitConnected([], "gmail"), false);
  });
});
