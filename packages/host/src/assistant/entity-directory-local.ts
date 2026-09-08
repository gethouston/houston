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

/**
 * A collection this deployment does not have at all - teams, the people in
 * them, their invitations - as opposed to one that happens to be empty. Thrown
 * rather than answered with `[]` because the two lead the model to opposite
 * sentences: an empty list invites "you have no teams yet, want one?", and the
 * truth is that this Houston has one person and their own agents. The route
 * turns it into the refusal the model reads (`routes/assistant-operate.ts`).
 */
export class UnsupportedEntityCollectionError extends Error {
  constructor(readonly collection: string) {
    super(`${collection} are not supported on this Houston`);
    this.name = "UnsupportedEntityCollectionError";
  }
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
    teams: async () => {
      throw new UnsupportedEntityCollectionError("teams");
    },
    members: async () => {
      throw new UnsupportedEntityCollectionError("team members");
    },
    invites: async () => {
      throw new UnsupportedEntityCollectionError("invitations");
    },
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
