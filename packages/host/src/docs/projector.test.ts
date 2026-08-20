import { docKey } from "@houston/domain";
import { expect, test } from "vitest";
import { LocalPaths } from "../paths";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import type { DocShadow } from "./http-shadow";
import { DocShadowProjector } from "./projector";

test("a family watcher event shadows the file's current whole document", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const paths = new LocalPaths();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({
    workspaceId: workspace.id,
    name: "A",
  });
  const root = paths.agentRoot(workspace, agent);
  const puts: unknown[] = [];
  const shadow: DocShadow = {
    async seed() {},
    async put(family, doc) {
      puts.push({ family, doc });
    },
  };
  const projector = new DocShadowProjector({ store, vfs, paths, shadow });
  await vfs.writeText(
    docKey(root, "learnings"),
    JSON.stringify([{ id: "l1", text: "remember", created_at: "now" }]),
  );

  projector.onEvent({ type: "LearningsChanged", agentPath: agent.id });
  await projector.flush();

  // Without a boot seed, the first projection lazily binds and back-fills
  // every family; the event's own family carries the file content.
  expect(
    puts.find((p) => (p as { family: string }).family === "learnings"),
  ).toEqual({
    family: "learnings",
    doc: [{ id: "l1", text: "remember", created_at: "now" }],
  });
});

test("the activity family projects the NORMALIZED items, not the raw file", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const paths = new LocalPaths();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({
    workspaceId: workspace.id,
    name: "A",
  });
  const root = paths.agentRoot(workspace, agent);
  const puts: { family: string; doc: unknown }[] = [];
  const shadow: DocShadow = {
    async seed() {},
    async put(family, doc) {
      puts.push({ family, doc });
    },
  };
  const projector = new DocShadowProjector({ store, vfs, paths, shadow });
  // A hand-edited file: one valid entry missing its description (the reader
  // defaults it) and one malformed entry (no title) the reader drops. The
  // gateway serves the doc as the board, so the doc must match what the pod's
  // own read would return.
  await vfs.writeText(
    docKey(root, "activity"),
    JSON.stringify([
      { id: "m1", title: "Say Hi", status: "needs_you" },
      { id: "broken" },
    ]),
  );

  projector.onEvent({ type: "ActivityChanged", agentPath: agent.id });
  await projector.flush();

  expect(puts.find((p) => p.family === "activity")).toEqual({
    family: "activity",
    doc: [{ id: "m1", title: "Say Hi", status: "needs_you", description: "" }],
  });
});

test("boot seed projects every family once; missing files converge to empty docs", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const paths = new LocalPaths();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({
    workspaceId: workspace.id,
    name: "A",
  });
  const root = paths.agentRoot(workspace, agent);
  const puts: { family: string; doc: unknown }[] = [];
  const shadow: DocShadow = {
    async seed() {},
    async put(family, doc) {
      puts.push({ family, doc });
    },
  };
  // Two families exist on disk (one of them an activity needing
  // normalization); the rest are absent and project their empty docs.
  await vfs.writeText(
    docKey(root, "routines"),
    JSON.stringify([
      {
        id: "r1",
        name: "Daily",
        prompt: "p",
        schedule: "0 9 * * *",
        enabled: true,
      },
    ]),
  );
  await vfs.writeText(
    docKey(root, "activity"),
    JSON.stringify([{ id: "m1", title: "T", status: "needs_you" }]),
  );

  const projector = new DocShadowProjector({ store, vfs, paths, shadow });
  projector.seed();
  await projector.flush();

  // Families with files project their content; absent families project the
  // empty doc (the pod's own read of a missing file answers empty, so the
  // doc-served answer must too).
  const families = puts.map((p) => p.family).sort();
  expect(families).toEqual([
    "activity",
    "config",
    "learnings",
    "routine_runs",
    "routines",
  ]);
  const activity = puts.find((p) => p.family === "activity");
  expect(activity?.doc).toEqual([
    { id: "m1", title: "T", status: "needs_you", description: "" },
  ]);
  expect(puts.find((p) => p.family === "learnings")?.doc).toEqual([]);
  expect(puts.find((p) => p.family === "config")?.doc).toEqual({});
});

test("a multi-agent host refuses ALL doc projection (route binds one agent)", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const paths = new LocalPaths();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const a = await store.createAgent({ workspaceId: workspace.id, name: "A" });
  await store.createAgent({ workspaceId: workspace.id, name: "B" });
  const puts: unknown[] = [];
  const shadow: DocShadow = {
    async seed() {},
    async put(family, doc) {
      puts.push({ family, doc });
    },
  };
  await vfs.writeText(
    docKey(paths.agentRoot(workspace, a), "learnings"),
    JSON.stringify([{ id: "l1", text: "t", created_at: "now" }]),
  );

  const projector = new DocShadowProjector({ store, vfs, paths, shadow });
  projector.seed();
  await projector.flush();
  // Even a post-seed event for an existing agent must not cross-post: the
  // shadow's URL names ONE agent and this host cannot tell which.
  projector.onEvent({ type: "LearningsChanged", agentPath: a.id });
  await projector.flush();

  expect(puts).toEqual([]);
});

test("a post-seed event for a foreign agent id never reaches the bound doc", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const paths = new LocalPaths();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const bound = await store.createAgent({
    workspaceId: workspace.id,
    name: "A",
  });
  const puts: { family: string; doc: unknown }[] = [];
  const shadow: DocShadow = {
    async seed() {},
    async put(family, doc) {
      puts.push({ family, doc });
    },
  };
  const projector = new DocShadowProjector({ store, vfs, paths, shadow });
  projector.seed();
  await projector.flush();
  const seeded = puts.length;

  // An agent directory appearing AFTER boot (leftover dir, unexpected
  // migration residue) fires watcher events; they must be refused.
  const stray = await store.createAgent({
    workspaceId: workspace.id,
    name: "B",
  });
  await vfs.writeText(
    docKey(paths.agentRoot(workspace, stray), "learnings"),
    JSON.stringify([{ id: "evil", text: "not yours", created_at: "now" }]),
  );
  projector.onEvent({ type: "LearningsChanged", agentPath: stray.id });
  await projector.flush();

  expect(puts.length).toBe(seeded);
  // The bound agent still projects.
  await vfs.writeText(
    docKey(paths.agentRoot(workspace, bound), "learnings"),
    JSON.stringify([{ id: "l1", text: "mine", created_at: "now" }]),
  );
  projector.onEvent({ type: "LearningsChanged", agentPath: bound.id });
  await projector.flush();
  expect(puts.at(-1)).toEqual({
    family: "learnings",
    doc: [{ id: "l1", text: "mine", created_at: "now" }],
  });
});

test("a vanished family file converges the doc back to empty", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const paths = new LocalPaths();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({
    workspaceId: workspace.id,
    name: "A",
  });
  const root = paths.agentRoot(workspace, agent);
  const puts: { family: string; doc: unknown }[] = [];
  const shadow: DocShadow = {
    async seed() {},
    async put(family, doc) {
      puts.push({ family, doc });
    },
  };
  const projector = new DocShadowProjector({ store, vfs, paths, shadow });
  await vfs.writeText(
    docKey(root, "routines"),
    JSON.stringify([
      {
        id: "r1",
        name: "D",
        prompt: "p",
        schedule: "0 9 * * *",
        enabled: true,
      },
    ]),
  );
  projector.onEvent({ type: "RoutinesChanged", agentPath: agent.id });
  await projector.flush();
  expect((puts.at(-1)?.doc as unknown[]).length).toBe(1);

  await vfs.deleteKey(docKey(root, "routines"));
  projector.onEvent({ type: "RoutinesChanged", agentPath: agent.id });
  await projector.flush();
  expect(puts.at(-1)).toEqual({ family: "routines", doc: [] });
});

test("a pod that boots before its agent hydrates binds on first projection", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const paths = new LocalPaths();
  const puts: { family: string; doc: unknown }[] = [];
  const shadow: DocShadow = {
    async seed() {},
    async put(family, doc) {
      puts.push({ family, doc });
    },
  };
  // Boot with ZERO agents (cloud pods can reach the seed before the
  // workspace tree hydrates) — must not poison, must not project.
  const projector = new DocShadowProjector({ store, vfs, paths, shadow });
  projector.seed();
  await projector.flush();
  expect(puts).toEqual([]);

  // The agent hydrates after boot; its first watcher event binds the
  // projector and back-fills the boot seed for every family.
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({
    workspaceId: workspace.id,
    name: "A",
  });
  await vfs.writeText(
    docKey(paths.agentRoot(workspace, agent), "routines"),
    JSON.stringify([
      {
        id: "r1",
        name: "D",
        prompt: "p",
        schedule: "0 9 * * *",
        enabled: true,
      },
    ]),
  );
  projector.onEvent({ type: "RoutinesChanged", agentPath: agent.id });
  await projector.flush();

  const families = puts.map((p) => p.family).sort();
  expect(families).toEqual([
    "activity",
    "config",
    "learnings",
    "routine_runs",
    "routines",
  ]);
  expect(
    (puts.find((p) => p.family === "routines")?.doc as unknown[]).length,
  ).toBe(1);

  // Still refuses a foreign agent after the late bind.
  const stray = await store.createAgent({
    workspaceId: workspace.id,
    name: "B",
  });
  const seeded = puts.length;
  projector.onEvent({ type: "RoutinesChanged", agentPath: stray.id });
  await projector.flush();
  expect(puts.length).toBe(seeded);
});
