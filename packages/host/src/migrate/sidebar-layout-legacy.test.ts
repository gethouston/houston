import {
  getPreference,
  loadPreferences,
  prefDocKey,
  setPreference,
} from "@houston/domain";
import { parseSidebarLayout } from "@houston/protocol";
import { expect, test } from "vitest";
import { CloudPaths } from "../paths";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import {
  migrateSidebarLayout,
  migrateStoredSidebarLayout,
} from "./sidebar-layout";

const group = (id: string, agentIds: string[], name = id) => ({
  id,
  name,
  collapsed: false,
  agentIds,
});

test("a malformed legacy layout is normalized into v2, keeping every group", () => {
  const long = "😀".repeat(70);
  const migrated = migrateStoredSidebarLayout({
    groups: [
      group("g1", ["a", "b", ""]),
      group("g1", ["c"], "duplicate"),
      group("g2", ["b", "d"], long),
      { ...group("g3", []), collapsed: "yes" },
    ],
    ungroupedOrder: ["d", "e", "", 7, "e"],
    defaultContext: "legacy",
  });
  expect(migrated).toEqual({
    groups: [
      group("g1", ["a", "b"]),
      group("g2", ["d"], "😀".repeat(60)),
      group("g3", []),
    ],
    order: [
      { kind: "group", id: "g1" },
      { kind: "group", id: "g2" },
      { kind: "group", id: "g3" },
      { kind: "agent", id: "e" },
    ],
  });
  expect(parseSidebarLayout(migrated)).toEqual(migrated);
});

test("a legacy layout over the group cap keeps the first groups it can store", () => {
  const migrated = migrateStoredSidebarLayout({
    groups: Array.from({ length: 205 }, (_, i) => group(`g${i}`, [])),
    ungroupedOrder: [],
  });
  expect(migrated?.groups).toHaveLength(200);
  expect(parseSidebarLayout(migrated)).toEqual(migrated);
});

test("boot migration stores a normalized layout instead of losing the groups", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const ws = await store.getOrCreatePersonalWorkspace("owner");
  await setPreference(
    vfs,
    ws.id,
    "sidebar_layout",
    JSON.stringify({
      groups: [group("g", ["a"], "x".repeat(80)), group("g", ["b"])],
      ungroupedOrder: ["a", "c"],
    }),
  );
  await migrateSidebarLayout({
    store,
    vfs,
    paths: new CloudPaths(),
    log: () => {},
  });
  const stored = parseSidebarLayout(
    JSON.parse((await getPreference(vfs, ws.id, "sidebar_layout")) ?? "null"),
  );
  expect(stored).toEqual({
    groups: [group("g", ["a"], "x".repeat(60))],
    order: [
      { kind: "group", id: "g" },
      { kind: "agent", id: "c" },
    ],
  });
});

async function legacyWorkspace(vfs: MemoryVfs) {
  const store = new MemoryWorkspaceStore();
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
      groups: [{ ...group("g", [agent.id]), context: "Shared note" }],
      ungroupedOrder: [],
    }),
  );
  return { store, paths, ws, noteKey };
}

test("the conversion write carries the pending notes, so a crash before the deletes is recovered", async () => {
  const writes: string[] = [];
  let crash = true;
  class CrashingVfs extends MemoryVfs {
    override async writeText(key: string, content: string): Promise<void> {
      if (key.endsWith("preferences.json")) writes.push(content);
      await super.writeText(key, content);
    }
    override async deleteKey(key: string): Promise<void> {
      if (crash) throw new Error("process died");
      await super.deleteKey(key);
    }
  }
  const vfs = new CrashingVfs();
  const { store, paths, ws, noteKey } = await legacyWorkspace(vfs);
  writes.length = 0;
  await migrateSidebarLayout({ store, vfs, paths, log: () => {} });
  const converted = JSON.parse(writes[0] ?? "{}") as Record<string, string>;
  expect(JSON.parse(converted.sidebar_layout ?? "null")).toMatchObject({
    order: [{ kind: "group", id: "g" }],
  });
  expect(converted.sidebar_layout_legacy_notes).toBeTruthy();
  expect(await vfs.readText(noteKey)).toBe("Shared note");
  crash = false;
  await migrateSidebarLayout({ store, vfs, paths, log: () => {} });
  expect(await vfs.readText(noteKey)).toBeNull();
  expect(await loadPreferences(vfs, ws.id)).not.toHaveProperty(
    "sidebar_layout_legacy_notes",
  );
});

test("a failed note removal keeps the marker and is retried on the next boot", async () => {
  let failures = 1;
  class FlakyVfs extends MemoryVfs {
    override async deleteKey(key: string): Promise<void> {
      if (failures-- > 0) throw new Error("disk busy");
      await super.deleteKey(key);
    }
  }
  const vfs = new FlakyVfs();
  const { store, paths, ws, noteKey } = await legacyWorkspace(vfs);
  const errors: unknown[] = [];
  const boot = () =>
    migrateSidebarLayout({
      store,
      vfs,
      paths,
      log: (_message, error) => errors.push(error),
    });
  await boot();
  expect(errors).toHaveLength(1);
  expect(await vfs.readText(noteKey)).toBe("Shared note");
  expect(await loadPreferences(vfs, ws.id)).toHaveProperty(
    "sidebar_layout_legacy_notes",
  );
  await boot();
  expect(await vfs.readText(noteKey)).toBeNull();
  const doc = await vfs.readText(prefDocKey(ws.id));
  expect(JSON.parse(doc ?? "{}")).not.toHaveProperty(
    "sidebar_layout_legacy_notes",
  );
  expect(errors).toHaveLength(1);
});
