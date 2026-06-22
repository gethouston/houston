import { expect, test } from "bun:test";
import { MemoryWorkspaceStore } from "./memory";

test("getOrCreatePersonalWorkspace is idempotent (same user => same workspace id)", async () => {
  const s = new MemoryWorkspaceStore();
  const a = await s.getOrCreatePersonalWorkspace("user-1");
  const b = await s.getOrCreatePersonalWorkspace("user-1");

  expect(a.id).toBe(b.id);
  expect(a.kind).toBe("personal");
  expect(a.name).toBe("Personal");
  expect(a.ownerUserId).toBe("user-1");
  expect(a.slug).toBe("user-1");
});

test("two different users get two different personal workspaces", async () => {
  const s = new MemoryWorkspaceStore();
  const a = await s.getOrCreatePersonalWorkspace("user-1");
  const b = await s.getOrCreatePersonalWorkspace("user-2");

  expect(a.id).not.toBe(b.id);
  expect(a.ownerUserId).toBe("user-1");
  expect(b.ownerUserId).toBe("user-2");
});

test("getWorkspace returns a created workspace and null for unknown ids", async () => {
  const s = new MemoryWorkspaceStore();
  const ws = await s.getOrCreatePersonalWorkspace("user-1");

  expect(await s.getWorkspace(ws.id)).toMatchObject({
    id: ws.id,
    ownerUserId: "user-1",
  });
  expect(await s.getWorkspace("nope")).toBeNull();
});

test("create / list / rename / delete agents in a workspace", async () => {
  const s = new MemoryWorkspaceStore();
  const ws = await s.getOrCreatePersonalWorkspace("user-1");

  const sales = await s.createAgent({ workspaceId: ws.id, name: "SalesAgent" });
  const hr = await s.createAgent({ workspaceId: ws.id, name: "HRAgent" });

  expect(sales.workspaceId).toBe(ws.id);
  expect(await s.getAgent(sales.id)).toMatchObject({ name: "SalesAgent" });

  // The owner sees EVERY agent in the workspace (no grants, no filtering).
  const listed = await s.listAgents(ws.id);
  expect(listed.map((a) => a.name).sort()).toEqual(["HRAgent", "SalesAgent"]);

  const renamed = await s.renameAgent(hr.id, "PeopleAgent");
  expect(renamed.name).toBe("PeopleAgent");
  expect(await s.getAgent(hr.id)).toMatchObject({ name: "PeopleAgent" });

  await s.deleteAgent(sales.id);
  expect(await s.getAgent(sales.id)).toBeNull();
  expect((await s.listAgents(ws.id)).map((a) => a.name)).toEqual([
    "PeopleAgent",
  ]);
});

test("listWorkspaces / listAllAgents enumerate every tenant (admin view)", async () => {
  const s = new MemoryWorkspaceStore();
  const ws1 = await s.getOrCreatePersonalWorkspace("user-1");
  const ws2 = await s.getOrCreatePersonalWorkspace("user-2");
  await s.createAgent({ workspaceId: ws1.id, name: "A1" });
  await s.createAgent({ workspaceId: ws2.id, name: "B1" });
  await s.createAgent({ workspaceId: ws2.id, name: "B2" });

  const workspaces = await s.listWorkspaces();
  expect(workspaces.map((w) => w.ownerUserId).sort()).toEqual([
    "user-1",
    "user-2",
  ]);

  const all = await s.listAllAgents();
  expect(all.map((a) => a.name).sort()).toEqual(["A1", "B1", "B2"]);
});

test("renameAgent throws on an unknown agent id (no silent no-op)", async () => {
  const s = new MemoryWorkspaceStore();
  await expect(s.renameAgent("ghost", "X")).rejects.toThrow();
});

test("deleteAgent throws on an unknown agent id (no silent no-op)", async () => {
  const s = new MemoryWorkspaceStore();
  await expect(s.deleteAgent("ghost")).rejects.toThrow();
});

test("a second workspace's agents never appear in the first's list", async () => {
  const s = new MemoryWorkspaceStore();
  const ws1 = await s.getOrCreatePersonalWorkspace("user-1");
  const ws2 = await s.getOrCreatePersonalWorkspace("user-2");

  const a1 = await s.createAgent({ workspaceId: ws1.id, name: "A1" });
  await s.createAgent({ workspaceId: ws2.id, name: "B1" });
  await s.createAgent({ workspaceId: ws2.id, name: "B2" });

  expect((await s.listAgents(ws1.id)).map((a) => a.id)).toEqual([a1.id]);
  expect((await s.listAgents(ws2.id)).map((a) => a.name).sort()).toEqual([
    "B1",
    "B2",
  ]);
});
