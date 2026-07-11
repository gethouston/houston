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

describe("planInvalidation — ActivityChanged reaches the board face stack", () => {
  const ev: HoustonEvent = {
    type: "ActivityChanged",
    data: { agent_path: PATH },
  };

  // The break: the per-agent board's face stacks are built from
  // `useConversations(path)` → ["conversations", path], but hosted
  // conversations are DERIVED from activities. A turn-driven contributor stamp
  // emits `ActivityChanged`; if that only invalidates ["activity", path] the
  // freshly-stamped contributors sit in the ["conversations", path] cache
  // untouched and faces refresh only on remount (navigate away + back).
  it("invalidates the per-agent conversations query (not just activity)", () => {
    const plan = planInvalidation(ev, {});
    ok(
      invalidates(plan, queryKeys.activity(PATH)),
      "status/cards ride activity — must still invalidate",
    );
    ok(
      invalidates(plan, queryKeys.conversations(PATH)),
      "face stack rides conversations — contributor stamp must reach it live",
    );
  });

  it("still patches the all-conversations slice for this agent", () => {
    const plan = planInvalidation(ev, {});
    deepStrictEqual(plan.patchAllConversations, [PATH]);
  });
});

describe("planInvalidation — unrelated cases keep their exact effects", () => {
  it("ConversationsChanged invalidates conversations + chat-history prefix", () => {
    const plan = planInvalidation(
      {
        type: "ConversationsChanged",
        data: { project_id: "p", agent_path: PATH },
      },
      {},
    );
    ok(invalidates(plan, queryKeys.conversations(PATH)));
    ok(invalidates(plan, queryKeys.chatHistoryForAgent(PATH)));
    deepStrictEqual(plan.patchAllConversations, [PATH]);
  });

  it("SessionStatus (completed) invalidates the broad activity prefix", () => {
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
    ok(invalidates(plan, ["activity"]));
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
});
