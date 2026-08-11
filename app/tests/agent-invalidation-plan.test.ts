import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { HoustonEvent } from "@houston-ai/core";
import { planInvalidation } from "../src/lib/agent-invalidation-plan.ts";
import { queryKeys } from "../src/lib/query-keys.ts";

const PATH = "Houston/Maya";

/** A query key appears in the plan's invalidate list (order-independent). */
function invalidates(plan: { invalidate: unknown[] }, key: unknown): boolean {
  const target = JSON.stringify(key);
  return plan.invalidate.some((k) => JSON.stringify(k) === target);
}

describe("planInvalidation — ActivityChanged reaches the board", () => {
  const ev: HoustonEvent = {
    type: "ActivityChanged",
    data: { agent_path: PATH },
  };

  it("invalidates the agent's activity query", () => {
    const plan = planInvalidation(ev, {});
    ok(
      invalidates(plan, queryKeys.activity(PATH)),
      "status/cards ride activity — must invalidate",
    );
  });

  it("patches the all-conversations slice for this agent", () => {
    const plan = planInvalidation(ev, {});
    deepStrictEqual(plan.patchAllConversations, [PATH]);
  });

  // The cross-agent aggregate is PATCHED, never invalidated: invalidating it
  // re-fans-out a read to every agent's pod and wakes the whole fleet.
  it("never invalidates the cross-agent aggregate", () => {
    const plan = planInvalidation(ev, {});
    strictEqual(invalidates(plan, queryKeys.allConversations([])), false);
    strictEqual(plan.invalidate.length, 1);
  });
});

describe("planInvalidation — unrelated cases keep their exact effects", () => {
  it("SharedSkillsChanged invalidates the whole shared-skills family", () => {
    // The server's event carries ITS workspace-id vocabulary (host folder
    // name, gateway "Houston") while query keys use the client's synthetic
    // "default" — an exact-id match would silently never fire, so the plan
    // invalidates by key-family prefix instead.
    const plan = planInvalidation(
      {
        type: "SharedSkillsChanged",
        data: { workspace_id: "Houston" },
      },
      {},
    );
    ok(invalidates(plan, ["shared-skills"]));
    strictEqual(invalidates(plan, queryKeys.sharedSkills("Houston")), false);
  });

  it("SkillsChanged invalidates the agent's skills manifest", () => {
    const plan = planInvalidation(
      {
        type: "SkillsChanged",
        data: { agent_path: PATH },
      },
      {},
    );
    ok(invalidates(plan, queryKeys.skills(PATH)));
    ok(invalidates(plan, queryKeys.skillsManifest(PATH)));
  });

  it("ConversationsChanged patches the aggregate + invalidates chat history", () => {
    const plan = planInvalidation(
      {
        type: "ConversationsChanged",
        data: { project_id: "p", agent_path: PATH },
      },
      {},
    );
    // The event carries no session key, so the agent's whole chat-history
    // prefix is invalidated — a teammate's turn must reach an open chat live.
    deepStrictEqual(plan.invalidate, [queryKeys.chatHistoryForAgent(PATH)]);
    deepStrictEqual(plan.patchAllConversations, [PATH]);
  });

  it("SessionStatus (completed) invalidates only that agent's activity", () => {
    const plan = planInvalidation(
      {
        type: "SessionStatus",
        data: {
          agent_path: PATH,
          session_key: "s",
          status: "completed",
          error: null,
        },
      },
      {},
    );
    ok(invalidates(plan, queryKeys.activity(PATH)));
    ok(invalidates(plan, queryKeys.skillsManifest(PATH)));
    strictEqual(invalidates(plan, ["activity"]), false);
    deepStrictEqual(plan.patchAllConversations, [PATH]);
  });

  it("SessionStatus (running) is a no-op", () => {
    const plan = planInvalidation(
      {
        type: "SessionStatus",
        data: {
          agent_path: PATH,
          session_key: "s",
          status: "running",
          error: null,
        },
      },
      {},
    );
    deepStrictEqual(plan.invalidate, []);
    deepStrictEqual(plan.patchAllConversations, []);
  });

  it("AgentsChanged reloads only the matching open workspace", () => {
    const match = planInvalidation(
      { type: "AgentsChanged", data: { workspace_id: "w1" } },
      { workspaceId: "w1" },
    );
    strictEqual(match.reloadAgentsWorkspace, "w1");
    const other = planInvalidation(
      { type: "AgentsChanged", data: { workspace_id: "w2" } },
      { workspaceId: "w1" },
    );
    strictEqual(other.reloadAgentsWorkspace, undefined);
  });

  // C13: every server-team mutation fans out AgentsChanged, so the rail's
  // teams have to refresh with the roster or it keeps the previous grouping.
  it("AgentsChanged refreshes the C13 teams and their member rows", () => {
    const plan = planInvalidation(
      { type: "AgentsChanged", data: { workspace_id: "w1" } },
      { workspaceId: "w1" },
    );
    ok(invalidates(plan, queryKeys.agentTeams()), "teams must refresh");
    ok(
      invalidates(plan, ["agent-team-members"]),
      "the event names no team, so member rows go by prefix",
    );
  });

  it("another workspace's AgentsChanged leaves the teams alone", () => {
    const plan = planInvalidation(
      { type: "AgentsChanged", data: { workspace_id: "w2" } },
      { workspaceId: "w1" },
    );
    deepStrictEqual(plan.invalidate, []);
  });

  it("ProviderLoginComplete refreshes statuses and focuses the window", () => {
    const plan = planInvalidation(
      {
        type: "ProviderLoginComplete",
        data: { provider: "anthropic", success: true, error: null },
      },
      {},
    );
    ok(invalidates(plan, queryKeys.providerStatuses()));
    strictEqual(plan.focusWindow, true);
  });

  it("CustomIntegrationsChanged refreshes the list + connection prefix", () => {
    const plan = planInvalidation({ type: "CustomIntegrationsChanged" }, {});
    ok(invalidates(plan, queryKeys.customIntegrations()));
    ok(invalidates(plan, ["integration-connections"]));
  });

  // PRODUCT-1298: the change event is the landing of a browser OAuth ONLY when
  // the hook consumed a fresh return marker — an in-app add or an agent's own
  // mid-turn change must never pull the window to the front.
  it("CustomIntegrationsChanged focuses only on a consumed OAuth return", () => {
    const returned = planInvalidation(
      { type: "CustomIntegrationsChanged" },
      { customOAuthReturn: true },
    );
    strictEqual(returned.focusWindow, true);
    const unrelated = planInvalidation(
      { type: "CustomIntegrationsChanged" },
      {},
    );
    strictEqual(unrelated.focusWindow, undefined);
  });
});

/**
 * HOU-981. The `/v1/events` feed has no replay cursor: a drop loses every event
 * emitted while it was down. Nothing re-read the cross-agent aggregate after
 * that, so a mission created during the gap stayed invisible for the rest of
 * the session. A re-connect is now a transport event the plan turns into a
 * re-sweep.
 */
describe("planInvalidation — EventStreamReconnected catches the aggregate up", () => {
  it("re-sweeps the cross-agent aggregate", () => {
    const plan = planInvalidation({ type: "EventStreamReconnected" }, {});
    ok(
      invalidates(plan, queryKeys.allConversations([])),
      "the aggregate prefix must be invalidated so every roster variant refetches",
    );
  });

  it("touches nothing else — a re-sweep already wakes every pod", () => {
    const plan = planInvalidation({ type: "EventStreamReconnected" }, {});
    strictEqual(plan.invalidate.length, 1);
    deepStrictEqual(plan.patchAllConversations, []);
    strictEqual(plan.reloadAgentsWorkspace, undefined);
    strictEqual(plan.focusWindow, undefined);
  });
});
