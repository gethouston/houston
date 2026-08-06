import assert from "node:assert";
import { test } from "node:test";
import {
  type KeyedStorage,
  purgeAccountLocalState,
} from "../src/lib/houston-local-state.ts";

// PRODUCT-1235: sign-out must erase every account-scoped houston.* localStorage
// trace so the next sign-in (any account) starts clean — while keeping the
// device-level keys (host connection, standalone local data).

function keyedStorage(store: Map<string, string>): KeyedStorage {
  return {
    get length() {
      return store.size;
    },
    key(i: number) {
      return [...store.keys()][i] ?? null;
    },
    removeItem(k: string) {
      store.delete(k);
    },
  };
}

test("purgeAccountLocalState removes account traces, keeps device keys", () => {
  const store = new Map<string, string>([
    // Account-scoped — must go.
    ["houston.pref.last_agent_id", "agent-1"],
    ["houston.sidebar-layout", "{}"],
    ["houston.read-cursors.u1", "{}"],
    ["houston.onboarding-completed.u1", "true"],
    ["houston.last-sign-in", '{"provider":"google"}'],
    ["houston.providerStatusCache.v2", "{}"],
    ["houston.web.cp.agentColors", "{}"],
    ["houston.sdk.some-state", "{}"],
    ["houston.theme.cache", "dark"],
    // Device-level / recovery — must survive sign-out.
    ["houston.web.engine.new", '{"url":"https://my-vps.example"}'],
    ["houston.web.engine", '{"url":"legacy"}'],
    ["houston.web.agents", "[]"],
    ["houston.web.agentfile:ws/agent", "data"],
    ["houston.pendingAgentMoves", '[{"agentId":"a1"}]'],
    // Not ours — never touched.
    ["other-app.key", "keep"],
  ]);

  purgeAccountLocalState(keyedStorage(store));

  assert.deepStrictEqual([...store.keys()].sort(), [
    "houston.pendingAgentMoves",
    "houston.web.agentfile:ws/agent",
    "houston.web.agents",
    "houston.web.engine",
    "houston.web.engine.new",
    "other-app.key",
  ]);
});

test("purgeAccountLocalState survives index renumbering mid-walk", () => {
  const store = new Map<string, string>([
    ["houston.a", "1"],
    ["houston.b", "2"],
    ["houston.c", "3"],
    ["plain", "keep"],
  ]);

  purgeAccountLocalState(keyedStorage(store));

  assert.deepStrictEqual([...store.keys()], ["plain"]);
});
