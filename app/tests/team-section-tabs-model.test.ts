import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { phoneTaskListReturn } from "../src/components/team-view/team-section-tabs-model.ts";
import type { NavEntry } from "../src/lib/nav-stack.ts";

const entry = (fields: Partial<NavEntry>): NavEntry => ({
  viewMode: "agents-home",
  settingsSection: null,
  activeAgentId: null,
  agentSection: null,
  agentsHomeAgentId: null,
  chatAgentId: null,
  chatMissionId: null,
  panelOpen: false,
  ...fields,
});

const list = entry({});
const drillIn = entry({ agentsHomeAgentId: "a", activeAgentId: "other" });
const screen = entry({
  viewMode: "agent",
  activeAgentId: "a",
  agentSection: "files",
  agentsHomeAgentId: "a",
});

describe("phoneTaskListReturn", () => {
  it("pops to the employee's drill-in it came from, whatever else it carries", () => {
    assert.equal(phoneTaskListReturn([list, drillIn, screen], 2, "a"), "pop");
  });

  it("replaces when the screen was opened from anywhere else", () => {
    assert.equal(phoneTaskListReturn([list, screen], 1, "a"), "replace");
    assert.equal(
      phoneTaskListReturn([entry({ agentsHomeAgentId: "b" }), screen], 1, "a"),
      "replace",
    );
  });

  it("never no-ops on the first entry", () => {
    assert.equal(phoneTaskListReturn([screen], 0, "a"), "replace");
  });

  it("does not pop into a pushed chat over the drill-in", () => {
    const chat = entry({ agentsHomeAgentId: "a", chatAgentId: "a" });
    assert.equal(phoneTaskListReturn([chat, screen], 1, "a"), "replace");
  });
});
