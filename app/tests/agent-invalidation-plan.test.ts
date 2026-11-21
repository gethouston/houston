import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { HoustonEvent } from "@houston-ai/core";
import { planInvalidation } from "../src/lib/agent-invalidation-plan.ts";
import { queryKeys } from "../src/lib/query-keys.ts";

const PATH = "Houston/Maya";

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

  it("never invalidates the cross-agent aggregate", () => {
    const plan = planInvalidation(ev, {});
    strictEqual(invalidates(plan, queryKeys.allConversations([])), false);
    strictEqual(plan.invalidate.length, 1);
  });
});

describe("planInvalidation — unrelated cases keep their exact effects", () => {
  it("SharedSkillsChanged invalidates the whole shared-skills family", () => {
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

describe("planInvalidation — AgentRoleChanged renames the row", () => {
  const ev: HoustonEvent = {
    type: "AgentRoleChanged",
    data: { agent_path: PATH },
  };

  it("re-lists the open workspace's roster, where each row's role lives", () => {
    const plan = planInvalidation(ev, { workspaceId: "ws-1" });
    strictEqual(plan.reloadAgentsWorkspace, "ws-1");
  });

  it("leaves the roster alone for an agent outside it", () => {
    const plan = planInvalidation(ev, {
      workspaceId: "ws-1",
      isKnownAgent: () => false,
    });
    strictEqual(plan.reloadAgentsWorkspace, undefined);
  });

  it("re-lists nothing with no workspace open", () => {
    strictEqual(planInvalidation(ev, {}).reloadAgentsWorkspace, undefined);
  });
});

describe("planInvalidation — RoutinesChanged reaches the remove confirmation", () => {
  it("refreshes the agent's routines and every member's routines list", () => {
    const plan = planInvalidation(
      { type: "RoutinesChanged", data: { agent_path: PATH } } as HoustonEvent,
      {},
    );
    ok(invalidates(plan, queryKeys.routines(PATH)));
    ok(invalidates(plan, queryKeys.memberRoutines()));
  });
});
