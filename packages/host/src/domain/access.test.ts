import { expect, test } from "bun:test";
import { canUseAgent, ownsWorkspace } from "./access";
import type { Agent, Workspace } from "./types";

const workspace = (over: Partial<Workspace> = {}): Workspace => ({
  id: "ws-1",
  ownerUserId: "u1",
  kind: "personal",
  runtime: "gke",
  name: "Personal",
  slug: "u1",
  createdAt: 0,
  ...over,
});

const agent = (over: Partial<Agent> = {}): Agent => ({
  id: "sales",
  workspaceId: "ws-1",
  name: "SalesAgent",
  createdAt: 0,
  ...over,
});

test("the owner of the agent's workspace may use it", () => {
  expect(
    canUseAgent({ userId: "u1", agent: agent(), workspace: workspace() }),
  ).toEqual({
    ok: true,
  });
});

test("a different user may not use the agent", () => {
  expect(
    canUseAgent({ userId: "u2", agent: agent(), workspace: workspace() }),
  ).toEqual({
    ok: false,
    reason: "not your agent",
  });
});

test("a null agent is not found", () => {
  expect(
    canUseAgent({ userId: "u1", agent: null, workspace: workspace() }),
  ).toEqual({
    ok: false,
    reason: "agent not found",
  });
});

test("a null workspace is treated as workspace not found", () => {
  expect(
    canUseAgent({ userId: "u1", agent: agent(), workspace: null }),
  ).toEqual({
    ok: false,
    reason: "workspace not found",
  });
});

test("a workspace whose id does not match the agent's is workspace not found", () => {
  const other = workspace({ id: "ws-2" });
  expect(
    canUseAgent({ userId: "u1", agent: agent(), workspace: other }),
  ).toEqual({
    ok: false,
    reason: "workspace not found",
  });
});

test("ownsWorkspace is true for the owner and false for everyone else", () => {
  expect(ownsWorkspace("u1", workspace())).toBe(true);
  expect(ownsWorkspace("u2", workspace())).toBe(false);
  expect(ownsWorkspace("u1", null)).toBe(false);
});
