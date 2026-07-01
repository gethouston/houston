import { describe, expect, test } from "vitest";
import type { WorkspaceStore } from "../ports";

/**
 * The WorkspaceStore CONTRACT, run verbatim against every adapter — the
 * anti-drift net for this port. An adapter that passes here is interchangeable
 * for the behavior the control plane actually depends on: lazy
 * personal-workspace provisioning, agent CRUD, owner-sees-all listing,
 * cross-workspace isolation, and error-on-unknown (no silent no-ops).
 *
 * Exported from `@houston/host` (OPEN) so BOTH the open adapter suite
 * (store/contract.test.ts: Memory/Local) AND the closed adapter suite in
 * `@houston/host-cloud` (store/pg.contract.test.ts: PgWorkspaceStore over pg-mem)
 * run the SAME assertions. The shared contract lives on the open side of the
 * seam; only the adapters it is pointed at differ.
 *
 * INTENTIONAL DIVERGENCES (NOT part of the shared contract — asserted per-impl
 * in memory.test.ts / local.test.ts and the divergence block in
 * store/contract.test.ts):
 *   - Id SHAPE. Memory/Pg mint opaque ids ("ws_…", "agent_…"); Local uses the
 *     on-disk folder name (workspace id = dir name, agent id = "<Ws>/<Agent>").
 *     The contract treats ids as opaque handles and never asserts their form.
 *   - getOrCreatePersonalWorkspace SEMANTICS. Memory keys the personal workspace
 *     by userId (two users → two workspaces); Local has ONE local user and
 *     returns the first existing dir (or creates a default), ignoring userId.
 *   - setWorkspaceRuntime. Memory/Pg flip the runtime; Local THROWS (a laptop
 *     workspace is always `local`).
 *   - createdAt / slug values. Memory mints real timestamps + slugify(userId);
 *     Local pins createdAt=0 and slug=name. Not load-bearing for the host.
 *
 * `secondWorkspace` is exported alongside so each adapter suite can stand up a
 * second, distinct workspace id working with that store's tenancy model.
 */
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
      // A syntactically valid-but-absent id (satisfies the local store's
      // "<ws>/<agent>" grammar, an opaque miss for the memory store).
      expect(await s.getAgent(`${ws.id}/ghost-agent`)).toBeNull();

      // The owner sees EVERY agent in the workspace (no grants, no filtering).
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
}

/**
 * Stand up a second, distinct workspace id, working with each store's tenancy
 * model: the memory store mints one per user, the local store keys by directory.
 * Returns the second workspace's id. Kept out of the contract body so the
 * divergence in HOW a workspace comes to exist stays explicit.
 */
export async function secondWorkspace(
  s: WorkspaceStore,
  firstId: string,
): Promise<string> {
  const ws2 = await s.getOrCreatePersonalWorkspace("user-2");
  if (ws2.id !== firstId) return ws2.id; // memory/pg: a fresh per-user workspace
  // Single-local-user store: getOrCreate ignores the userId and returns the
  // first dir. The local store provisions a workspace directory on createAgent,
  // so seeding a sibling id stands up a second workspace.
  await s.createAgent({ workspaceId: "Workspace2", name: "__seed__" });
  await s.deleteAgent("Workspace2/__seed__");
  return "Workspace2";
}
