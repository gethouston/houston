import { sharedSkillsDirKey } from "@houston/domain";
import { expect, test } from "vitest";
import type { Agent, Workspace } from "./domain/types";
import { CloudPaths, conversationKey, LocalPaths, settingsKey } from "./paths";
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
const agent: Agent = {
  id: "a1",
  workspaceId: "w1",
  name: "Sales",
  createdAt: 0,
};

test("CloudPaths reproduces today's GCS-prefix layout", () => {
  const p = new CloudPaths();
  expect(p.agentPrefix(ws, agent)).toBe("ws/w1/a1");
  expect(p.agentRoot(ws, agent)).toBe("ws/w1/a1/workspace");
  expect(p.dataRoot(ws, agent)).toBe("ws/w1/a1/data");
  expect(conversationKey(p, ws, agent, "c1")).toBe(
    "ws/w1/a1/data/conversations/c1.json",
  );
  expect(settingsKey(p, ws, agent)).toBe("ws/w1/a1/data/settings.json");
});

test("shared root (ADR 0003) — cloud sits beside agent prefixes, local is a dot-dir", () => {
  // Load-bearing shapes: the cloud key is what the pod-store's shared routes
  // scope (OrgRoot + "/shared"), and the local dot name is what keeps agent
  // discovery (dot-filtered) from listing the store as an agent.
  expect(new CloudPaths().sharedRoot(ws)).toBe("ws/w1/shared");
  expect(sharedSkillsDirKey(new CloudPaths().sharedRoot(ws))).toBe(
    "ws/w1/shared/skills",
  );
  const local = new LocalPaths();
  expect(local.sharedRoot({ ...ws, id: "Work" })).toBe("Work/.shared");
  expect(sharedSkillsDirKey(local.sharedRoot({ ...ws, id: "Work" }))).toBe(
    "Work/.shared/skills",
  );
});

test("CloudPaths agrees with the per-turn dispatch's own helpers (one set of keys)", () => {
  const p = new CloudPaths();
  const prefix = turnPrefixFor(ws, agent);
  expect(p.agentPrefix(ws, agent)).toBe(prefix);
  expect(conversationKey(p, ws, agent, "c1")).toBe(
    turnConversationKey(prefix, "c1"),
  );
  expect(settingsKey(p, ws, agent)).toBe(turnSettingsKey(prefix));
});

test("LocalPaths maps to the desktop tree (agent.id IS the <Workspace>/<Agent> path)", () => {
  const p = new LocalPaths();
  const localWs = { ...ws, id: "Work" };
  const localAgent = { ...agent, id: "Work/Sales", workspaceId: "Work" };
  expect(p.agentPrefix(localWs, localAgent)).toBe("Work/Sales");
  expect(p.agentRoot(localWs, localAgent)).toBe("Work/Sales");
  expect(p.dataRoot(localWs, localAgent)).toBe("Work/Sales/.houston/runtime");
  expect(conversationKey(p, localWs, localAgent, "c1")).toBe(
    "Work/Sales/.houston/runtime/conversations/c1.json",
  );
});

test("local agentRoot == agent.id, so a host write and a watched write hit the same path", () => {
  // The FsWatcher emits agentPath = "<Workspace>/<Agent>" (= agent.id), and
  // agentRoot is that exact prefix — host-written and user-written files align.
  const p = new LocalPaths();
  const root = p.agentRoot(
    { ...ws, id: "Work" },
    { ...agent, id: "Work/Sales" },
  );
  expect(`${root}/.houston/activity/activity.json`).toBe(
    "Work/Sales/.houston/activity/activity.json",
  );
});
