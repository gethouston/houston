import {
  loadActivities,
  loadRoutines,
  loadSkills,
  loadSkillsFromDir,
  sharedSkillsDirKey,
} from "@houston/domain";
import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import { DEFAULT_PATHS } from "../routes/agent-authz";
import { reachableAgentsForWorkspace } from "../routes/reachable-agents";
import type { Vfs } from "../vfs";
import type { EntityDirectory } from "./entity-directory";

export interface LocalDirectoryInput {
  store: WorkspaceStore;
  vfs?: Vfs;
  paths?: WorkspacePaths;
  workspaceId: string;
  agentId: string;
}

/** Local hosts have personal workspaces; org teams, people and invites are gateway-owned. */
export function localEntityDirectory(
  input: LocalDirectoryInput,
): EntityDirectory {
  const { store, workspaceId, agentId } = input;
  const paths = input.paths ?? DEFAULT_PATHS;
  const agents: EntityDirectory["agents"] = async () =>
    (await reachableAgentsForWorkspace(store, workspaceId)).filter(
      (a) => a.agent.id !== agentId,
    );
  const ownedWorkspaces = async () => {
    const own = await store.getWorkspace(workspaceId);
    if (!own) throw new Error("assistant workspace is unavailable");
    return (await store.listWorkspacesForUser(own.ownerUserId)).filter(
      (w) => w.ownerUserId === own.ownerUserId,
    );
  };
  const vfs = () => {
    if (!input.vfs) throw new Error("agent data is not configured");
    return input.vfs;
  };
  const agentRoot = async (id: string) => {
    const target = (await agents()).find((a) => a.agent.id === id);
    if (!target) throw new Error("agent is not addressable");
    return paths.agentRoot(target.workspace, target.agent);
  };
  return {
    agents,
    teams: async () => [],
    members: async () => [],
    invites: async () => [],
    workspaces: async () =>
      (await ownedWorkspaces()).map(({ id, name }) => ({ id, name })),
    routines: async (id) =>
      (await loadRoutines(vfs(), await agentRoot(id))).items.map(
        ({ id, name }) => ({ id, name }),
      ),
    skills: async (id) =>
      (await loadSkills(vfs(), await agentRoot(id))).items.map(
        ({ name, title }) => ({ slug: name, name: title ?? name }),
      ),
    activities: async (id) =>
      (await loadActivities(vfs(), await agentRoot(id))).items.map(
        ({ id, title }) => ({ id, name: title }),
      ),
    sharedSkills: async (id) => {
      const workspace = (await ownedWorkspaces()).find((w) => w.id === id);
      if (!workspace) throw new Error("workspace is not addressable");
      return (
        await loadSkillsFromDir(
          vfs(),
          sharedSkillsDirKey(paths.sharedRoot(workspace)),
        )
      ).items.map(({ name, title }) => ({ slug: name, name: title ?? name }));
    },
  };
}
