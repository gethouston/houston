import { describe, expect, test } from "vitest";
import type { WorkspaceStore } from "../ports";
import { runAgentNameContract } from "./store-name-contract";

export function runWorkspaceStoreContract(
  name: string,
  make: () => WorkspaceStore,
): void {
  describe(`WorkspaceStore contract: ${name}`, () => {
    test("getOrCreatePersonalWorkspace is idempotent for the same caller", async () => {
      const s = make();
      const a = await s.getOrCreatePersonalWorkspace("user-1");
      const b = await s.getOrCreatePersonalWorkspace("user-1");
      expect(a.id).toBe(b.id);
      expect(a.kind).toBe("personal");
    });

    test("getWorkspace round-trips a provisioned workspace and is null for unknown ids", async () => {
      const s = make();
      const ws = await s.getOrCreatePersonalWorkspace("user-1");
      expect((await s.getWorkspace(ws.id))?.id).toBe(ws.id);
      expect(await s.getWorkspace("definitely-not-a-workspace")).toBeNull();
    });

    test("create / get / list agents in a workspace; getAgent is null for unknown ids", async () => {
      const s = make();
      const ws = await s.getOrCreatePersonalWorkspace("user-1");

      const sales = await s.createAgent({
        workspaceId: ws.id,
        name: "SalesAgent",
      });
      await s.createAgent({ workspaceId: ws.id, name: "HRAgent" });

      expect(sales.workspaceId).toBe(ws.id);
      expect((await s.getAgent(sales.id))?.name).toBe("SalesAgent");
      expect(await s.getAgent(`${ws.id}/ghost-agent`)).toBeNull();

      const listed = await s.listAgents(ws.id);
      expect(listed.map((a) => a.name).sort()).toEqual([
        "HRAgent",
        "SalesAgent",
      ]);
    });

    test("renameAgent reflects in getAgent + listAgents; preserves the workspace", async () => {
      const s = make();
      const ws = await s.getOrCreatePersonalWorkspace("user-1");
      const hr = await s.createAgent({ workspaceId: ws.id, name: "HRAgent" });

      const renamed = await s.renameAgent(hr.id, "PeopleAgent");
      expect(renamed.name).toBe("PeopleAgent");
      expect(renamed.workspaceId).toBe(ws.id);
      expect((await s.getAgent(renamed.id))?.name).toBe("PeopleAgent");
      expect((await s.listAgents(ws.id)).map((a) => a.name)).toEqual([
        "PeopleAgent",
      ]);
    });

    test("deleteAgent removes it; getAgent then reads null and it leaves the list", async () => {
      const s = make();
      const ws = await s.getOrCreatePersonalWorkspace("user-1");
      const a = await s.createAgent({ workspaceId: ws.id, name: "Temp" });
      const keep = await s.createAgent({ workspaceId: ws.id, name: "Keep" });

      await s.deleteAgent(a.id);
      expect(await s.getAgent(a.id)).toBeNull();
      expect((await s.listAgents(ws.id)).map((x) => x.id)).toEqual([keep.id]);
    });

    test("renameAgent / deleteAgent throw on an unknown agent (no silent no-op)", async () => {
      const s = make();
      const ws = await s.getOrCreatePersonalWorkspace("user-1");
      const ghost = `${ws.id}/ghost-agent`;
      await expect(s.renameAgent(ghost, "X")).rejects.toThrow();
      await expect(s.deleteAgent(ghost)).rejects.toThrow();
    });

    test("listWorkspaces / listAllAgents enumerate every tenant (admin/operator view)", async () => {
      const s = make();
      const ws = await s.getOrCreatePersonalWorkspace("user-1");
      await s.createAgent({ workspaceId: ws.id, name: "A1" });
      await s.createAgent({ workspaceId: ws.id, name: "A2" });

      const workspaces = await s.listWorkspaces();
      expect(workspaces.some((w) => w.id === ws.id)).toBe(true);

      const all = await s.listAllAgents();
      expect(all.map((a) => a.name).sort()).toEqual(["A1", "A2"]);
    });

    test("listWorkspacesForUser includes a provisioned workspace", async () => {
      const s = make();
      const ws = await s.getOrCreatePersonalWorkspace("user-1");
      const mine = await s.listWorkspacesForUser("user-1");
      expect(mine.some((w) => w.id === ws.id)).toBe(true);
    });

    test("a second workspace's agents never leak into the first's listing", async () => {
      const s = make();
      const ws1 = await s.getOrCreatePersonalWorkspace("user-1");
      const ws2 = await secondWorkspace(s, ws1.id);

      const a1 = await s.createAgent({ workspaceId: ws1.id, name: "A1" });
      await s.createAgent({ workspaceId: ws2, name: "B1" });
      await s.createAgent({ workspaceId: ws2, name: "B2" });

      expect((await s.listAgents(ws1.id)).map((a) => a.id)).toEqual([a1.id]);
      expect((await s.listAgents(ws2)).map((a) => a.name).sort()).toEqual([
        "B1",
        "B2",
      ]);
    });
  });
  runAgentNameContract(name, make);
}

export async function secondWorkspace(
  s: WorkspaceStore,
  firstId: string,
): Promise<string> {
  const ws2 = await s.getOrCreatePersonalWorkspace("user-2");
  if (ws2.id !== firstId) return ws2.id;
  await s.createAgent({ workspaceId: "Workspace2", name: "__seed__" });
  await s.deleteAgent("Workspace2/__seed__");
  return "Workspace2";
}
