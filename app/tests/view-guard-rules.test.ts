import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deadViewStep } from "../src/components/shell/view-guard-rules.ts";
import type { Agent } from "../src/lib/types.ts";

const agent = { id: "agent-a", name: "Agent A" } as Agent;

describe("deadViewStep", () => {
  const base = {
    showAiModels: true,
    showAssistant: true,
    showSkills: true,
    gatesReady: true,
    agentsReady: true,
    agents: [agent],
    activeAgentId: "agent-a",
  };

  it("keeps a live view", () => {
    assert.equal(deadViewStep({ ...base, viewMode: "agents-home" }), "keep");
    assert.equal(deadViewStep({ ...base, viewMode: "agent" }), "keep");
    // Ungated: no gate can take the Academy away, so the guard must never
    // send a user home off it.
    assert.equal(deadViewStep({ ...base, viewMode: "academy" }), "keep");
  });

  it("sends a view no screen answers to home", () => {
    assert.equal(deadViewStep({ ...base, viewMode: "chat" }), "go-home");
    // Retired ids an older install may still have pinned. These are stale
    // `viewMode`s that must land the user home rather than on a blank card.
    assert.equal(deadViewStep({ ...base, viewMode: "inbox" }), "go-home");
    assert.equal(deadViewStep({ ...base, viewMode: "about-me" }), "go-home");
    assert.equal(deadViewStep({ ...base, viewMode: "agent-store" }), "go-home");
    assert.equal(
      deadViewStep({ ...base, viewMode: "organization" }),
      "go-home",
    );
  });

  it("sends the assistant home on a deployment that serves none", () => {
    // Not a role gate: discovery answered 501/503, so there is no address to
    // open a chat at and the screen is not even mounted.
    assert.equal(
      deadViewStep({ ...base, viewMode: "assistant", showAssistant: false }),
      "go-home",
    );
    assert.equal(deadViewStep({ ...base, viewMode: "assistant" }), "keep");
  });

  it("waits rather than bouncing the assistant while discovery is in flight", () => {
    // Discovery is null until it lands, so the gate reads false in that window:
    // acting on it would throw the user off the screen they just opened.
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
    // The shared library belongs to whoever OWNS the space: a caller whose
    // gate closed under an open screen must not be left standing on it.
    assert.equal(
      deadViewStep({ ...base, viewMode: "skills-home", showSkills: false }),
      "go-home",
    );
    assert.equal(deadViewStep({ ...base, viewMode: "skills-home" }), "keep");
  });

  it("sends a RETIRED view home whatever the gates say", () => {
    // The Permissions screen and the standalone Time worked screen are gone (a
    // team's focused agent screen, and a section inside Admin). No
    // gate can make either valid again, so a `viewMode` an older session
    // persisted must go home rather than strand the user on a blank card.
    for (const viewMode of ["permissions", "time-worked"]) {
      assert.equal(deadViewStep({ ...base, viewMode }), "go-home", viewMode);
    }
  });

  it("waits out a gated view while the capabilities are still loading", () => {
    // Every gate reads false off null capabilities, so acting on that window
    // would bounce the user off a screen they are entitled to, on every boot
    // and every space switch.
    for (const viewMode of ["ai-hub", "skills-home"]) {
      assert.equal(
        deadViewStep({
          ...base,
          viewMode,
          showAiModels: false,
          showSkills: false,
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
    // No teams read can ever make `chat` a screen, so this one is genuinely
    // stale, not in flight — and home with no teams is the Inbox.
    assert.equal(
      deadViewStep({ ...base, viewMode: "chat", agents: [] }),
      "go-home",
    );
  });
});
