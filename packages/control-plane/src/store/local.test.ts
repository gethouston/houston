import { test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalWorkspaceStore } from "./local";

/**
 * The desktop tree IS the store: workspaces are subdirs of the root, agents are
 * subdirs of each, ids are the on-disk paths. Pins the id model the local
 * profile relies on (agent.id = "<Workspace>/<Agent>") + traversal safety.
 */

function tree(layout: Record<string, string[]>): string {
  const root = mkdtempSync(join(tmpdir(), "houston-local-"));
  for (const [ws, agents] of Object.entries(layout)) {
    for (const a of agents) mkdirSync(join(root, ws, a), { recursive: true });
  }
  return root;
}

test("reads workspaces + agents off disk; ids are the on-disk paths", async () => {
  const root = tree({ Work: ["Sales", "HR"], Home: ["Chef"] });
  const store = new LocalWorkspaceStore(root);

  const workspaces = await store.listWorkspaces();
  expect(workspaces.map((w) => w.id).sort()).toEqual(["Home", "Work"]);
  expect(workspaces[0]!.runtime).toBe("local");

  const agents = await store.listAgents("Work");
  expect(agents.map((a) => a.id).sort()).toEqual(["Work/HR", "Work/Sales"]);
  expect(agents.find((a) => a.id === "Work/Sales")).toMatchObject({
    workspaceId: "Work",
    name: "Sales",
  });
});

test("getAgent resolves an existing path, rejects unknown + traversal", async () => {
  const root = tree({ Work: ["Sales"] });
  const store = new LocalWorkspaceStore(root);
  expect((await store.getAgent("Work/Sales"))?.name).toBe("Sales");
  expect(await store.getAgent("Work/Ghost")).toBeNull();
  expect(await store.getAgent("Work")).toBeNull(); // a workspace, not an agent
  expect(await store.getAgent("Work/../../etc/passwd")).toBeNull(); // traversal
});

test("getOrCreatePersonalWorkspace returns the first, or creates the default when empty", async () => {
  const empty = new LocalWorkspaceStore(
    mkdtempSync(join(tmpdir(), "houston-empty-")),
  );
  const created = await empty.getOrCreatePersonalWorkspace("local-owner");
  expect(created.id).toBe("Houston");

  const existing = new LocalWorkspaceStore(tree({ Acme: ["Bot"] }));
  expect((await existing.getOrCreatePersonalWorkspace("local-owner")).id).toBe(
    "Acme",
  );
});

test("createAgent makes the directory; rename + delete move/remove it on disk", async () => {
  const root = tree({ Work: [] });
  const store = new LocalWorkspaceStore(root);

  const agent = await store.createAgent({
    workspaceId: "Work",
    name: "Marketing",
  });
  expect(agent.id).toBe("Work/Marketing");
  expect(existsSync(join(root, "Work", "Marketing"))).toBe(true);

  const renamed = await store.renameAgent("Work/Marketing", "Growth");
  expect(renamed.id).toBe("Work/Growth");
  expect(existsSync(join(root, "Work", "Marketing"))).toBe(false);
  expect(existsSync(join(root, "Work", "Growth"))).toBe(true);

  await store.deleteAgent("Work/Growth");
  expect(existsSync(join(root, "Work", "Growth"))).toBe(false);
});

test("createAgent rejects a name with a slash or traversal", async () => {
  const store = new LocalWorkspaceStore(tree({ Work: [] }));
  await expect(
    store.createAgent({ workspaceId: "Work", name: "a/b" }),
  ).rejects.toThrow("invalid agent name");
  await expect(
    store.createAgent({ workspaceId: "Work", name: ".." }),
  ).rejects.toThrow("invalid agent name");
});

test("listWorkspacesForUser returns everything (single local user); listAllAgents flattens", async () => {
  const store = new LocalWorkspaceStore(tree({ A: ["x"], B: ["y", "z"] }));
  expect((await store.listWorkspacesForUser("local-owner")).length).toBe(2);
  expect((await store.listAllAgents()).map((a) => a.id).sort()).toEqual([
    "A/x",
    "B/y",
    "B/z",
  ]);
});

test("dotfiles + stray files are ignored (only real dirs are workspaces/agents)", async () => {
  const root = tree({ Work: ["Sales"] });
  writeFileSync(join(root, ".DS_Store"), "");
  writeFileSync(join(root, "Work", "notes.txt"), "");
  const store = new LocalWorkspaceStore(root);
  expect((await store.listWorkspaces()).map((w) => w.id)).toEqual(["Work"]);
  expect((await store.listAgents("Work")).map((a) => a.id)).toEqual([
    "Work/Sales",
  ]);
});
