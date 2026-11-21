import assert from "node:assert";
import { test } from "node:test";
import {
  type KeyedStorage,
  purgeAccountLocalState,
} from "../src/lib/houston-local-state.ts";

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
    ["houston.pref.last_agent_id", "agent-1"],
    ["houston.sidebar-layout", "{}"],
    ["houston.read-cursors.u1", "{}"],
    ["houston.onboarding-completed.u1", "true"],
    ["houston.last-sign-in", '{"provider":"google"}'],
    ["houston.providerStatusCache.v2", "{}"],
    ["houston.web.cp.agentColors", "{}"],
    ["houston.sdk.some-state", "{}"],
    ["houston.theme.cache", "dark"],
    ["houston.web.engine.new", '{"url":"https://my-vps.example"}'],
    ["houston.web.engine", '{"url":"legacy"}'],
    ["houston.web.agents", "[]"],
    ["houston.web.agentfile:ws/agent", "data"],
    ["houston.pendingAgentMoves", '[{"agentId":"a1"}]'],
    ["houston.pref.push.device_id", "123e4567-e89b-42d3-a456-426614174000"],
    ["houston.pref.notifications_enabled", "false"],
    ["houston.pref.push.registration", "{}"],
    ["houston.cloudMigration.outcome", "done"],
    ["houston.ota.sequence.production.12", "42"],
    ["houston.ota.native_builtin_sequence.production.12", "40"],
    ["other-app.key", "keep"],
  ]);

  purgeAccountLocalState(keyedStorage(store));

  assert.deepStrictEqual([...store.keys()].sort(), [
    "houston.cloudMigration.outcome",
    "houston.ota.native_builtin_sequence.production.12",
    "houston.ota.sequence.production.12",
    "houston.pendingAgentMoves",
    "houston.pref.notifications_enabled",
    "houston.pref.push.device_id",
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
