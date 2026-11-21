import { docKey } from "@houston/domain";
import { expect, test, vi } from "vitest";
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

test("a multi-agent host defers binding until the gateway addresses an agent", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const paths = new LocalPaths();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const stale = await store.createAgent({
    workspaceId: workspace.id,
    name: "Old Name",
  });
  const live = await store.createAgent({
    workspaceId: workspace.id,
    name: "New Name",
  });
  const puts: { family: string; doc: unknown }[] = [];
  const shadow: DocShadow = {
    async seed() {},
    async put(family, doc) {
      puts.push({ family, doc });
    },
  };
  await vfs.writeText(
    docKey(paths.agentRoot(workspace, stale), "learnings"),
    JSON.stringify([{ id: "old", text: "stale", created_at: "then" }]),
  );
  await vfs.writeText(
    docKey(paths.agentRoot(workspace, live), "learnings"),
    JSON.stringify([{ id: "new", text: "live", created_at: "now" }]),
  );

  const projector = new DocShadowProjector({ store, vfs, paths, shadow });
  projector.seed();
  await projector.flush();
  projector.onEvent({ type: "LearningsChanged", agentPath: stale.id });
  projector.onEvent({ type: "LearningsChanged", agentPath: live.id });
  await projector.flush();
  expect(puts).toEqual([]);

  projector.bindAddressed(live.id);
  await projector.flush();
  expect(puts.find((p) => p.family === "learnings")?.doc).toEqual([
    { id: "new", text: "live", created_at: "now" },
  ]);
  expect(puts.map((p) => p.family).sort()).toEqual([
    "activity",
    "config",
    "learnings",
    "routine_runs",
    "routines",
  ]);

  const seeded = puts.length;
  projector.onEvent({ type: "LearningsChanged", agentPath: stale.id });
  await projector.flush();
  expect(puts.length).toBe(seeded);
});

test("an addressed id that is not an agent on this host does not bind", async () => {
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
  const projector = new DocShadowProjector({ store, vfs, paths, shadow });
  projector.seed();
  await projector.flush();
  projector.bindAddressed("Personal/Nobody");
  await projector.flush();
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
  expect(
    (puts.find((p) => p.family === "routines")?.doc as unknown[]).length,
  ).toBe(1);

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
  const projector = new DocShadowProjector({ store, vfs, paths, shadow });
  projector.seed();
  await projector.flush();
  expect(puts).toEqual([]);

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

  const stray = await store.createAgent({
    workspaceId: workspace.id,
    name: "B",
  });
  const seeded = puts.length;
  projector.onEvent({ type: "RoutinesChanged", agentPath: stray.id });
  await projector.flush();
  expect(puts.length).toBe(seeded);
});

test("boundAgent resolves after the seed to the bound id, or undefined", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const paths = new LocalPaths();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({
    workspaceId: workspace.id,
    name: "A",
  });
  const shadow: DocShadow = { async seed() {}, async put() {} };
  const projector = new DocShadowProjector({ store, vfs, paths, shadow });
  projector.seed();
  expect(await projector.boundAgent()).toBe(agent.id);

  await store.createAgent({ workspaceId: workspace.id, name: "B" });
  const ambiguous = new DocShadowProjector({ store, vfs, paths, shadow });
  ambiguous.seed();
  expect(await ambiguous.boundAgent()).toBeUndefined();
});

test("a family file with trailing junk projects its salvaged leading value", async () => {
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
  const value = [{ id: "l1", text: "kept", created_at: "now" }];
  await vfs.writeText(
    docKey(root, "learnings"),
    `${JSON.stringify(value)}[{ "id": "l1",`,
  );

  projector.onEvent({ type: "LearningsChanged", agentPath: agent.id });
  await projector.flush();

  expect(puts.find((p) => p.family === "learnings")).toEqual({
    family: "learnings",
    doc: value,
  });
});

test("an unparseable family file fails only its family and names the doc key", async () => {
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
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await vfs.writeText(docKey(root, "learnings"), "{oops");
    await vfs.writeText(
      docKey(root, "activity"),
      JSON.stringify([{ id: "m1", title: "T", status: "needs_you" }]),
    );
    const projector = new DocShadowProjector({ store, vfs, paths, shadow });
    projector.seed();
    await projector.flush();

    expect(puts.map((p) => p.family)).not.toContain("learnings");
    expect(puts.find((p) => p.family === "activity")).toBeTruthy();
    const reported = errors.mock.calls.some((call) =>
      call.some(
        (arg) =>
          arg instanceof Error &&
          arg.message.includes(docKey(root, "learnings")),
      ),
    );
    expect(reported).toBe(true);
  } finally {
    errors.mockRestore();
  }
});

test("cross-agent refusals are a latched warn, never repeated per family", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const paths = new LocalPaths();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  await store.createAgent({ workspaceId: workspace.id, name: "A" });
  const shadow: DocShadow = { async seed() {}, async put() {} };
  const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const projector = new DocShadowProjector({ store, vfs, paths, shadow });
    projector.seed();
    await projector.flush();

    const stray = await store.createAgent({
      workspaceId: workspace.id,
      name: "B",
    });
    for (let i = 0; i < 3; i++) {
      projector.onEvent({ type: "LearningsChanged", agentPath: stray.id });
      await projector.flush();
    }

    const refusals = warns.mock.calls.filter((call) =>
      String(call[0]).includes("refusing cross-agent projection"),
    );
    expect(refusals).toHaveLength(1);
    expect(
      errors.mock.calls.some((call) =>
        String(call[0]).includes("refusing cross-agent projection"),
      ),
    ).toBe(false);
  } finally {
    warns.mockRestore();
    errors.mockRestore();
  }
});

test("the binding follows a rename: the moved directory re-binds and re-seeds", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const paths = new LocalPaths();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const old = await store.createAgent({
    workspaceId: workspace.id,
    name: "Old Name",
  });
  const puts: { family: string; doc: unknown }[] = [];
  const shadow: DocShadow = {
    async seed() {},
    async put(family, doc) {
      puts.push({ family, doc });
    },
  };
  const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const projector = new DocShadowProjector({ store, vfs, paths, shadow });
    projector.seed();
    await projector.flush();
    expect(await projector.boundAgent()).toBe(old.id);
    puts.length = 0;

    await store.deleteAgent(old.id);
    const renamed = await store.createAgent({
      workspaceId: workspace.id,
      name: "New Name",
    });
    await vfs.writeText(
      docKey(paths.agentRoot(workspace, renamed), "learnings"),
      JSON.stringify([{ id: "l1", text: "after rename", created_at: "now" }]),
    );
    projector.onEvent({ type: "LearningsChanged", agentPath: renamed.id });
    await projector.flush();

    expect(puts.find((p) => p.family === "learnings")?.doc).toEqual([
      { id: "l1", text: "after rename", created_at: "now" },
    ]);
    expect(puts.map((p) => p.family).sort()).toEqual([
      "activity",
      "config",
      "learnings",
      "routine_runs",
      "routines",
    ]);
    expect(await projector.boundAgent()).toBe(renamed.id);
    expect(
      warns.mock.calls.some((call) =>
        String(call[0]).includes("refusing cross-agent projection"),
      ),
    ).toBe(false);
    expect(errors).not.toHaveBeenCalled();
  } finally {
    warns.mockRestore();
    errors.mockRestore();
  }
});

test("boundAgent follows a rename before the first projection", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const paths = new LocalPaths();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const old = await store.createAgent({
    workspaceId: workspace.id,
    name: "Old Name",
  });
  const shadow: DocShadow = { async seed() {}, async put() {} };
  const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const projector = new DocShadowProjector({ store, vfs, paths, shadow });
    projector.seed();
    expect(await projector.boundAgent()).toBe(old.id);
    await store.deleteAgent(old.id);
    const renamed = await store.createAgent({
      workspaceId: workspace.id,
      name: "New Name",
    });
    expect(await projector.boundAgent()).toBe(renamed.id);
    await projector.flush();
  } finally {
    warns.mockRestore();
  }
});

test("the binding stays put when the bound agent vanishes without a single successor", async () => {
  const store = new MemoryWorkspaceStore();
  const vfs = new MemoryVfs();
  const paths = new LocalPaths();
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const old = await store.createAgent({
    workspaceId: workspace.id,
    name: "Old Name",
  });
  const shadow: DocShadow = { async seed() {}, async put() {} };
  const warns = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const projector = new DocShadowProjector({ store, vfs, paths, shadow });
    projector.seed();
    expect(await projector.boundAgent()).toBe(old.id);
    await store.deleteAgent(old.id);
    expect(await projector.boundAgent()).toBe(old.id);
    await store.createAgent({ workspaceId: workspace.id, name: "A" });
    await store.createAgent({ workspaceId: workspace.id, name: "B" });
    expect(await projector.boundAgent()).toBe(old.id);
  } finally {
    warns.mockRestore();
  }
});
