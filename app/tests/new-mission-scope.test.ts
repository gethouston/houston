import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { newMissionScopeFor } from "../src/lib/new-mission-scope.ts";

const at = (
  viewMode: string,
  agentsHomeAgentId: string | null = null,
  activeAgentId: string | null = null,
) => ({ viewMode, agentsHomeAgentId, activeAgentId });

describe("newMissionScopeFor", () => {
  it("a drilled agent IS the subject", () => {
    assert.deepEqual(newMissionScopeFor(at("agents-home", "a1")), {
      kind: "agent",
      agentId: "a1",
    });
  });

  it("the Agents LIST names no subject", () => {
    assert.deepEqual(newMissionScopeFor(at("agents-home", null)), {
      kind: "home",
    });
  });

  it("an employee screen scopes to that employee in every section", () => {
    assert.deepEqual(newMissionScopeFor(at("agent", null, "a1")), {
      kind: "agent",
      agentId: "a1",
    });
  });

  it("an employee screen with no employee resolved falls back", () => {
    assert.deepEqual(newMissionScopeFor(at("agent", null, null)), {
      kind: "home",
    });
  });

  it("every other screen falls back to the shared rule", () => {
    for (const view of ["academy", "settings", "store"])
      assert.deepEqual(newMissionScopeFor(at(view, "a1", "t1")), {
        kind: "home",
      });
  });
});
