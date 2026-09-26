import { getPreference, setPreference } from "@houston/domain";
import { expect, test } from "vitest";
import { CloudPaths } from "../paths";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import {
  migrateSidebarLayout,
  migrateStoredSidebarLayout,
} from "./sidebar-layout";

test("migration removes group notes and unsupported layout fields on repeated boots", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const paths = new CloudPaths();
  const ws = await store.getOrCreatePersonalWorkspace("owner");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "Ada" });
  const noteKey = `${paths.agentRoot(ws, agent)}/GROUP.md`;
  await vfs.writeText(noteKey, "Shared note");
  await setPreference(
    vfs,
    ws.id,
    "sidebar_layout",
    JSON.stringify({
      groups: [
        {
          id: "g",
          name: "Ops",
          collapsed: false,
          agentIds: [agent.id],
          context: "Shared note",
        },
      ],
      ungroupedOrder: [],
      unsupported: true,
    }),
  );
  const errors: unknown[] = [];
  const run = () =>
    migrateSidebarLayout({
      store,
      vfs,
      paths,
      log: (_message, error) => errors.push(error),
    });
  await run();
  const migrated = await getPreference(vfs, ws.id, "sidebar_layout");
  expect(JSON.parse(migrated ?? "null")).toEqual({
    groups: [{ id: "g", name: "Ops", collapsed: false, agentIds: [agent.id] }],
    order: [{ kind: "group", id: "g" }],
  });
  expect(await vfs.readText(noteKey)).toBeNull();
  await run();
  expect(await getPreference(vfs, ws.id, "sidebar_layout")).toBe(migrated);
  await vfs.writeText(noteKey, "new personal note");
  await run();
  expect(await vfs.readText(noteKey)).toBe("new personal note");
  expect(errors).toEqual([]);
});

test("v2 layouts and unrelated group notes survive boot", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const paths = new CloudPaths();
  const ws = await store.getOrCreatePersonalWorkspace("owner");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "Ada" });
  const noteKey = `${paths.agentRoot(ws, agent)}/GROUP.md`;
  await vfs.writeText(noteKey, "personal note");
  await setPreference(
    vfs,
    ws.id,
    "sidebar_layout",
    JSON.stringify({
      groups: [],
      order: [{ kind: "agent", id: agent.id }],
    }),
  );
  await migrateSidebarLayout({ store, vfs, paths, log: () => {} });
  expect(await vfs.readText(noteKey)).toBe("personal note");
  await setPreference(
    vfs,
    ws.id,
    "sidebar_layout",
    JSON.stringify({
      groups: [
        {
          id: "g",
          name: "Ops",
          collapsed: false,
          agentIds: [agent.id],
          context: "old note",
        },
      ],
      ungroupedOrder: [],
    }),
  );
  await migrateSidebarLayout({ store, vfs, paths, log: () => {} });
  expect(await vfs.readText(noteKey)).toBe("personal note");
});

test("legacy default context removes a matching note for an unlisted ungrouped agent", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const paths = new CloudPaths();
  const ws = await store.getOrCreatePersonalWorkspace("owner");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "Ada" });
  const key = `${paths.agentRoot(ws, agent)}/GROUP.md`;
  await vfs.writeText(key, "default note\n");
  await setPreference(
    vfs,
    ws.id,
    "sidebar_layout",
    JSON.stringify({
      groups: [],
      ungroupedOrder: [],
      defaultContext: "default note",
    }),
  );
  await migrateSidebarLayout({ store, vfs, paths, log: () => {} });
  expect(await vfs.readText(key)).toBeNull();
});

test("stored sidebar migration converts old root order and preserves v2 order", () => {
  const groups = [
    { id: "g1", name: "One", collapsed: false, agentIds: ["inside"] },
    { id: "g2", name: "Two", collapsed: true, agentIds: [] },
  ];
  const old = { groups, ungroupedOrder: ["a", "b"] };
  const order = [
    { kind: "group", id: "g1" },
    { kind: "group", id: "g2" },
    { kind: "agent", id: "a" },
    { kind: "agent", id: "b" },
  ];
  expect(migrateStoredSidebarLayout(old)).toEqual({ groups, order });
  const mixed = {
    groups,
    order: [order[2], order[0], order[3], order[1]],
    ungroupedOrder: ["b", "a"],
    context: "removed",
  };
  expect(migrateStoredSidebarLayout(mixed)).toEqual({
    groups,
    order: mixed.order,
  });
  const v2 = { groups, order: mixed.order };
  expect(migrateStoredSidebarLayout(v2)).toEqual(v2);
  const groupsOnly = { groups, order: order.slice(0, 2) };
  expect(migrateStoredSidebarLayout({ groups, ungroupedOrder: [3] })).toEqual(
    groupsOnly,
  );
  expect(
    migrateStoredSidebarLayout({
      groups,
      order: [{ kind: "nested", id: "g1" }],
    }),
  ).toEqual(groupsOnly);
  expect(migrateStoredSidebarLayout("corrupt")).toBeNull();
});

test("one agent's file error does not block another agent", async () => {
  const store = new MemoryWorkspaceStore();
  const paths = new CloudPaths();
  const ws = await store.getOrCreatePersonalWorkspace("owner");
  const first = await store.createAgent({ workspaceId: ws.id, name: "Ada" });
  const second = await store.createAgent({ workspaceId: ws.id, name: "Bo" });
  const failedKey = `${paths.agentRoot(ws, first)}/GROUP.md`;
  const removedKey = `${paths.agentRoot(ws, second)}/GROUP.md`;
  class FailingVfs extends MemoryVfs {
    override async deleteKey(key: string): Promise<void> {
      if (key === failedKey) throw new Error("unreadable file");
      await super.deleteKey(key);
    }
  }
  const vfs = new FailingVfs();
  await vfs.writeText(failedKey, "Shared note");
  await vfs.writeText(removedKey, "Shared note");
  await setPreference(
    vfs,
    ws.id,
    "sidebar_layout",
    JSON.stringify({
      groups: [
        {
          id: "g",
          name: "Ops",
          collapsed: false,
          agentIds: [first.id, second.id],
          context: "Shared note",
        },
      ],
      ungroupedOrder: [],
    }),
  );
  const errors: unknown[] = [];
  await migrateSidebarLayout({
    store,
    vfs,
    paths,
    log: (_message, error) => errors.push(error),
  });
  expect(await vfs.readText(removedKey)).toBeNull();
  expect(errors).toHaveLength(1);
});
