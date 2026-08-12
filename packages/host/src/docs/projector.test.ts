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
