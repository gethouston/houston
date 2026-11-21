import { describe, expect, test } from "vitest";
import { AgentNameConflictError, type WorkspaceStore } from "../ports";

export function runAgentNameContract(
  name: string,
  make: () => WorkspaceStore,
): void {
  describe(`WorkspaceStore name contract: ${name}`, () => {
    test.each([
      "Mia",
      "mia",
      "  MIA ",
    ])("createAgent refuses %j when Mia exists, and leaves Mia alone", async (taken) => {
      const s = make();
      const ws = await s.getOrCreatePersonalWorkspace("user-1");
      const mia = await s.createAgent({ workspaceId: ws.id, name: "Mia" });

      await expect(
        s.createAgent({ workspaceId: ws.id, name: taken }),
      ).rejects.toBeInstanceOf(AgentNameConflictError);
      expect(await s.listAgents(ws.id)).toEqual([mia]);
    });

    test("createAgent refuses the decomposed (NFD) spelling of a composed (NFC) name", async () => {
      const s = make();
      const ws = await s.getOrCreatePersonalWorkspace("user-1");
      const jose = await s.createAgent({
        workspaceId: ws.id,
        name: "Jos\u00e9",
      });

      await expect(
        s.createAgent({ workspaceId: ws.id, name: "Jose\u0301" }),
      ).rejects.toBeInstanceOf(AgentNameConflictError);
      expect(await s.listAgents(ws.id)).toEqual([jose]);
    });

    test("renameAgent refuses another agent's name in another Unicode form", async () => {
      const s = make();
      const ws = await s.getOrCreatePersonalWorkspace("user-1");
      await s.createAgent({ workspaceId: ws.id, name: "Jose\u0301" });
      const leo = await s.createAgent({ workspaceId: ws.id, name: "Leo" });

      await expect(s.renameAgent(leo.id, "jos\u00e9")).rejects.toBeInstanceOf(
        AgentNameConflictError,
      );
    });

    test("the same name in another workspace is free", async () => {
      const s = make();
      const ws1 = await s.getOrCreatePersonalWorkspace("user-1");
      await s.createAgent({ workspaceId: ws1.id, name: "Mia" });
      const other = await s.getOrCreatePersonalWorkspace("user-2");
      const ws2 = other.id === ws1.id ? "Workspace2" : other.id;
      const created = await s.createAgent({ workspaceId: ws2, name: "mia" });
      expect(created.name).toBe("mia");
    });

    test("renameAgent refuses a case variant of ANOTHER agent's name", async () => {
      const s = make();
      const ws = await s.getOrCreatePersonalWorkspace("user-1");
      await s.createAgent({ workspaceId: ws.id, name: "Mia" });
      const leo = await s.createAgent({ workspaceId: ws.id, name: "Leo" });

      await expect(s.renameAgent(leo.id, "MIA")).rejects.toBeInstanceOf(
        AgentNameConflictError,
      );
      expect((await s.listAgents(ws.id)).map((a) => a.name).sort()).toEqual([
        "Leo",
        "Mia",
      ]);
    });

    test("renameAgent to a new spelling of the agent's OWN name works", async () => {
      const s = make();
      const ws = await s.getOrCreatePersonalWorkspace("user-1");
      const mia = await s.createAgent({ workspaceId: ws.id, name: "mia" });

      const renamed = await s.renameAgent(mia.id, "Mia");
      expect(renamed.name).toBe("Mia");
      expect((await s.listAgents(ws.id)).map((a) => a.name)).toEqual(["Mia"]);
    });
  });
}
