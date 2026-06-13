import { test, expect } from "bun:test";
import type { Agent, Workspace } from "./domain/types";
import { CloudPaths, LocalPaths, conversationKey, settingsKey } from "./paths";
import {
  conversationKey as turnConversationKey,
  prefixFor as turnPrefixFor,
  settingsKey as turnSettingsKey,
} from "./turn/deps";

/**
 * The path seam: CloudPaths must reproduce the EXACT keys the cloud already
 * uses (so the shared handlers and the per-turn dispatch agree on byte-for-byte
 * the same GCS objects), and LocalPaths must map to the desktop tree.
 */

const ws: Workspace = {
  id: "w1",
  ownerUserId: "alice",
  kind: "personal",
  name: "Work",
  slug: "work",
  runtime: "cloudrun",
  createdAt: 0,
};
const agent: Agent = { id: "a1", workspaceId: "w1", name: "Sales", createdAt: 0 };

test("CloudPaths reproduces today's GCS-prefix layout", () => {
  const p = new CloudPaths();
  expect(p.agentPrefix(ws, agent)).toBe("ws/w1/a1");
  expect(p.agentRoot(ws, agent)).toBe("ws/w1/a1/workspace");
  expect(p.dataRoot(ws, agent)).toBe("ws/w1/a1/data");
  expect(conversationKey(p, ws, agent, "c1")).toBe("ws/w1/a1/data/conversations/c1.json");
  expect(settingsKey(p, ws, agent)).toBe("ws/w1/a1/data/settings.json");
});

test("CloudPaths agrees with the per-turn dispatch's own helpers (one set of keys)", () => {
  const p = new CloudPaths();
  const prefix = turnPrefixFor(ws, agent);
  expect(p.agentPrefix(ws, agent)).toBe(prefix);
  expect(conversationKey(p, ws, agent, "c1")).toBe(turnConversationKey(prefix, "c1"));
  expect(settingsKey(p, ws, agent)).toBe(turnSettingsKey(prefix));
});

test("LocalPaths maps to the desktop tree (human names, .houston directly under the agent dir)", () => {
  const p = new LocalPaths();
  // Local ids ARE the folder names.
  const localWs = { ...ws, id: "Work" };
  const localAgent = { ...agent, id: "Sales" };
  expect(p.agentPrefix(localWs, localAgent)).toBe("Work/Sales");
  expect(p.agentRoot(localWs, localAgent)).toBe("Work/Sales");
  expect(p.dataRoot(localWs, localAgent)).toBe("Work/Sales/.houston/runtime");
  expect(conversationKey(p, localWs, localAgent, "c1")).toBe(
    "Work/Sales/.houston/runtime/conversations/c1.json",
  );
});

test("local agentRoot has NO workspace/ split — .houston sits where the watcher classifier expects it", () => {
  // The FsWatcher classifies <Workspace>/<Agent>/.houston/... — agentRoot must be
  // exactly that prefix so a host write and a watched write target the same path.
  const p = new LocalPaths();
  const root = p.agentRoot({ ...ws, id: "Work" }, { ...agent, id: "Sales" });
  expect(`${root}/.houston/activity/activity.json`).toBe("Work/Sales/.houston/activity/activity.json");
});
