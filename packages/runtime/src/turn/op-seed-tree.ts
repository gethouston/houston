import { join } from "node:path";
import { LocalPaths } from "@houston/host/src/paths";
import { seedAgentTree } from "@houston/host/src/routes/agent-seed-tree";
import { LocalWorkspaceStore } from "@houston/host/src/store/local";
import { FsVfs } from "@houston/host/src/vfs";
import type { SeedOp } from "./op-grammar-seed";
import { pendingLegacyFamilies } from "./turn-layout-legacy";

export interface SeedTree {
  id: string;
  workspaceRel: string;
}

export async function buildSeedTree(
  storeRoot: string,
  op: SeedOp,
  routineCreatedBy: string | undefined,
  existing?: { workspaceId: string; name: string },
): Promise<SeedTree> {
  const workspacesRoot = join(storeRoot, "workspaces");
  const workspaces = new LocalWorkspaceStore(workspacesRoot);
  const workspaceId =
    existing?.workspaceId ??
    (await workspaces.getOrCreatePersonalWorkspace(routineCreatedBy ?? "")).id;
  const agent = await workspaces.createAgent({
    workspaceId,
    name: existing?.name ?? op.name,
  });
  const workspace = await workspaces.getWorkspace(workspaceId);
  if (!workspace) throw new Error(`seed: no workspace folder ${workspaceId}`);
  await seedAgentTree(
    { store: workspaces, vfs: new FsVfs(workspacesRoot) },
    agent,
    new LocalPaths().agentRoot(workspace, agent),
    {
      ...(op.claudeMd !== undefined ? { claudeMd: op.claudeMd } : {}),
      ...(op.seeds ? { seeds: op.seeds } : {}),
    },
    routineCreatedBy,
  );
  return { id: agent.id, workspaceRel: `workspaces/${agent.id}` };
}

export async function pruneListed(
  storeRoot: string,
  tree: SeedTree,
  listed: ReadonlySet<string>,
): Promise<void> {
  const local = new FsVfs(storeRoot);
  for (const key of await local.list(tree.workspaceRel)) {
    if (listed.has(key)) {
      await local.deleteKey(key);
    } else if (collidesWithListed(key, listed)) {
      console.warn(
        `[op] seed completion skipped ${key}: the tree holds a colliding path`,
      );
      await local.deleteKey(key);
    }
  }
}

function collidesWithListed(key: string, listed: ReadonlySet<string>): boolean {
  const parts = key.split("/");
  for (let i = 1; i < parts.length; i++)
    if (listed.has(parts.slice(0, i).join("/"))) return true;
  const asDir = `${key}/`;
  for (const other of listed) if (other.startsWith(asDir)) return true;
  return false;
}

export async function pruneLegacyFamilies(
  storeRoot: string,
  tree: SeedTree,
  listed: readonly string[],
): Promise<void> {
  const local = new FsVfs(storeRoot);
  for (const family of pendingLegacyFamilies(tree, listed)) {
    const key = `${tree.workspaceRel}/${family}`;
    if (!(await local.exists(key))) continue;
    console.warn(
      `[op] seed completion skipped ${key}: its flat twin awaits migration`,
    );
    await local.deleteKey(key);
  }
}
