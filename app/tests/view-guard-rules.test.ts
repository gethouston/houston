import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deadViewStep } from "../src/components/shell/view-guard-rules.ts";
import type { Agent } from "../src/lib/types.ts";

const agent = { id: "agent-a", name: "Agent A" } as Agent;

describe("deadViewStep", () => {
  const base = {
    showAiModels: true,
    showAssistant: true,
    onboardingActive: false,
    showOrganization: true,
    gatesReady: true,
    agentsReady: true,
    agents: [agent],
    activeAgentId: "agent-a",
  };

  it("keeps a live view", () => {
    assert.equal(deadViewStep({ ...base, viewMode: "agents-home" }), "keep");
    assert.equal(deadViewStep({ ...base, viewMode: "agent" }), "keep");
    assert.equal(deadViewStep({ ...base, viewMode: "academy" }), "keep");
    assert.equal(deadViewStep({ ...base, viewMode: "profile" }), "keep");
    assert.equal(deadViewStep({ ...base, viewMode: "about-me" }), "keep");
  });

  it("sends a view no screen answers to home", () => {
    assert.equal(deadViewStep({ ...base, viewMode: "chat" }), "go-home");
    assert.equal(deadViewStep({ ...base, viewMode: "inbox" }), "go-home");
    assert.equal(deadViewStep({ ...base, viewMode: "agent-store" }), "go-home");
    assert.equal(
      deadViewStep({ ...base, viewMode: "organization" }),
      "go-home",
    );
  });

  it("sends the assistant home on a deployment that serves none", () => {
    assert.equal(
      deadViewStep({ ...base, viewMode: "assistant", showAssistant: false }),
      "go-home",
    );
    assert.equal(deadViewStep({ ...base, viewMode: "assistant" }), "keep");
  });

  it("keeps the assistant while the manager runs onboarding, whatever discovery says", () => {
    assert.equal(
      deadViewStep({
        ...base,
        viewMode: "assistant",
        showAssistant: false,
        onboardingActive: true,
      }),
      "keep",
    );
    assert.equal(
      deadViewStep({
        ...base,
        viewMode: "assistant",
        showAssistant: false,
        onboardingActive: false,
      }),
      "go-home",
    );
  });

  it("waits rather than bouncing the assistant while discovery is in flight", () => {
    assert.equal(
      deadViewStep({
        ...base,
        viewMode: "assistant",
        showAssistant: false,
        gatesReady: false,
      }),
      "wait",
    );
  });

  it("sends a role-blocked view home", () => {
    assert.equal(
      deadViewStep({ ...base, viewMode: "ai-hub", showAiModels: false }),
      "go-home",
    );
    assert.equal(
      deadViewStep({ ...base, viewMode: "admin", showOrganization: false }),
      "go-home",
    );
    assert.equal(deadViewStep({ ...base, viewMode: "admin" }), "keep");
  });

  it("sends a RETIRED view home whatever the gates say", () => {
    for (const viewMode of ["permissions", "time-worked", "skills-home"]) {
      assert.equal(deadViewStep({ ...base, viewMode }), "go-home", viewMode);
    }
  });

  it("waits out a gated view while the capabilities are still loading", () => {
    for (const viewMode of ["ai-hub", "admin"]) {
      assert.equal(
        deadViewStep({
          ...base,
          viewMode,
          showAiModels: false,
          showOrganization: false,
          gatesReady: false,
        }),
        "wait",
        viewMode,
      );
    }
  });

  it("sends a deleted employee screen home", () => {
    assert.equal(
      deadViewStep({ ...base, viewMode: "agent", activeAgentId: "agent-gone" }),
      "go-home",
    );
  });

  it("waits for the roster before judging a restored employee screen", () => {
    assert.equal(
      deadViewStep({
        ...base,
        viewMode: "agent",
        agents: [],
        agentsReady: false,
      }),
      "wait",
    );
  });

  it("keeps an employee screen while that employee is visible", () => {
    assert.equal(
      deadViewStep({
        ...base,
        viewMode: "agent",
        activeAgentId: agent.id,
        agents: [agent],
      }),
      "keep",
    );
    assert.equal(
      deadViewStep({
        ...base,
        viewMode: "agent",
        activeAgentId: agent.id,
        agents: [],
      }),
      "go-home",
    );
  });

  it("keeps an employee screen after a folder is deleted", () => {
    assert.equal(deadViewStep({ ...base, viewMode: "agent" }), "keep");
  });

  it("still sends a non-top-level view home without employees", () => {
    assert.equal(
      deadViewStep({ ...base, viewMode: "chat", agents: [] }),
      "go-home",
    );
  });
});
