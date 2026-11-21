import { docKey, saveActivities } from "@houston/domain";
import { expect, test, vi } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import { LocalPaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import { MemoryVfs } from "../vfs";
import { collectHeartbeatSnapshot } from "./collect";

const WS = { id: "Personal", name: "Personal", slug: "Personal" } as Workspace;
const agent = (name: string): Agent => ({
  id: `Personal/${name}`,
  workspaceId: "Personal",
  name,
  createdAt: 0,
});
const ANA = agent("Ana");
const BOB = agent("Bob");

test("an agent whose doc reads with diagnostics is unread, and logged", async () => {
  const vfs = new MemoryVfs();
  const paths = new LocalPaths();
  await saveActivities(vfs, ANA.id, [
    { id: "m1", title: "Invoice", description: "", status: "needs_you" },
  ]);
  await vfs.writeText(docKey(paths.agentRoot(WS, BOB), "activity"), "{}");
  const log = vi.fn();
  const store = {
    listWorkspacesForUser: async () => [WS],
    listAgents: async () => [ANA, BOB],
  } as unknown as WorkspaceStore;
  const snapshot = await collectHeartbeatSnapshot(
    { store, vfs, paths, userId: "u", log },
    0,
    new Set(),
  );
  expect(snapshot.unreadAgents).toEqual([BOB.id]);
  expect(snapshot.needsYou.items).toHaveLength(1);
  expect(log).toHaveBeenCalledWith(
    expect.stringContaining("read incompletely"),
  );
});
