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
 * The `/v1/events` feed has no replay cursor: a drop loses every event emitted
 * while it was down, and which ones is unknowable. A re-connect is a transport
 * event the plan turns into a full catch-up sweep — anything narrower leaves
 * some surface (an agent created during the gap, a routine that finished)
 * silently stale until the user remounts it.
 */
describe("planInvalidation — EventStreamReconnected catches the world up", () => {
  it("sweeps the whole cache", () => {
    const plan = planInvalidation({ type: "EventStreamReconnected" }, {});
    strictEqual(
      plan.invalidateAll,
      true,
      "a gap of unknown content cannot be caught up by a key list",
    );
  });

  it("reloads the open workspace's roster, which no cache key covers", () => {
    const plan = planInvalidation(
      { type: "EventStreamReconnected" },
      { workspaceId: "default" },
    );
    strictEqual(plan.reloadAgentsWorkspace, "default");
  });

  it("stays inert on the surfaces a sweep cannot express", () => {
    const plan = planInvalidation({ type: "EventStreamReconnected" }, {});
    deepStrictEqual(plan.patchAllConversations, []);
    strictEqual(plan.reloadAgentsWorkspace, undefined);
    strictEqual(plan.focusWindow, undefined);
  });
});

/**
 * The client's personal workspace id is the SYNTHETIC "default" the adapter
 * substitutes for whatever the host serves; an event carries the SERVER's id
 * (the local host's on-disk folder name, the gateway's engine id). A string
 * compare between the two is always false, so every `AgentsChanged` for the
 * personal space was dropped: an agent the assistant created reached the app
 * and stayed invisible until a manual refresh.
 */
describe("planInvalidation — the personal space's two vocabularies", () => {
  it("reloads the roster for a personal-space event named by the host", () => {
    const plan = planInvalidation(
      { type: "AgentsChanged", data: { workspace_id: "Personal" } },
      { workspaceId: "default" },
    );
    strictEqual(
      plan.reloadAgentsWorkspace,
      "default",
      "an agent created by an agent must appear without a refresh",
    );
  });

  it("still refuses a TEAM space's event while personal is open", () => {
    const plan = planInvalidation(
      {
        type: "AgentsChanged",
        data: { workspace_id: "org:0123456789abcdef" },
      },
      { workspaceId: "default" },
    );
    strictEqual(plan.reloadAgentsWorkspace, undefined);
    deepStrictEqual(plan.invalidate, []);
  });

  it("refreshes the sidebar layout for the host's own personal id", () => {
    const plan = planInvalidation(
      { type: "SidebarLayoutChanged", data: { workspace_id: "Personal" } },
      { workspaceId: "default" },
    );
    ok(invalidates(plan, queryKeys.sidebarLayout("default")));
  });
});

/**
 * The hosted event stream is org-wide: the gateway fans in every awake pod
 * in the space, not just the viewer's assigned agents. An event naming an
 * agent outside the viewer's roster must not trigger the aggregate patch —
 * that read is a deterministic `403 not allowed` on every event the agent
 * emits (HOUSTON-APP-540).
 */
describe("planInvalidation — events for agents outside the roster", () => {
  const OTHER = "Houston/SomeoneElsesAgent";
  const isKnownAgent = (path: string) => path === PATH;

  it("skips the aggregate patch for an unknown agent", () => {
    const plan = planInvalidation(
      { type: "ActivityChanged", data: { agent_path: OTHER } },
      { isKnownAgent },
    );
    deepStrictEqual(plan.patchAllConversations, []);
  });

  it("still patches a known agent", () => {
    const plan = planInvalidation(
      { type: "ConversationsChanged", data: { agent_path: PATH } },
      { isKnownAgent },
    );
    deepStrictEqual(plan.patchAllConversations, [PATH]);
  });

  it("SessionStatus (completed) for an unknown agent patches nothing", () => {
    const plan = planInvalidation(
      {
        type: "SessionStatus",
        data: {
          agent_path: OTHER,
          session_key: "s",
          status: "completed",
          error: null,
        },
      },
      { isKnownAgent },
    );
    deepStrictEqual(plan.patchAllConversations, []);
  });

  it("without a roster predicate every agent is known", () => {
    const plan = planInvalidation(
      { type: "ActivityChanged", data: { agent_path: OTHER } },
      {},
    );
    deepStrictEqual(plan.patchAllConversations, [OTHER]);
  });
});
