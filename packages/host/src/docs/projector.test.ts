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

  expect(puts).toEqual([
    {
      family: "learnings",
      doc: [{ id: "l1", text: "remember", created_at: "now" }],
    },
  ]);
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

  expect(puts).toEqual([
    {
      family: "activity",
      doc: [
        { id: "m1", title: "Say Hi", status: "needs_you", description: "" },
      ],
    },
  ]);
});

test("boot seed projects every existing family once, missing files skipped", async () => {
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
  // normalization); the rest are absent and must not project.
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
  expect(families).toEqual(["activity", "routines"]);
  const activity = puts.find((p) => p.family === "activity");
  expect(activity?.doc).toEqual([
    { id: "m1", title: "T", status: "needs_you", description: "" },
  ]);
});
