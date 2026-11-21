import type { Agent, Workspace, WorkspaceId } from "../domain/types";
import type { WorkspaceStore } from "../ports";
import {
  type AgentRef,
  agentRefDirectory,
  matchAgentRefs as matchRefs,
  qualifiedAgentRef,
} from "./agent-refs";

export interface ReachableAgent {
  workspace: Workspace;
  agent: Agent;
}

const toRef = ({ workspace, agent }: ReachableAgent): AgentRef => ({
  id: agent.id,
  name: agent.name,
  workspace: workspace.name,
  workspaceId: workspace.id,
});

export function isAddressableAgent(agent: Agent): boolean {
  return !agent.name.startsWith(".");
}

export async function reachableAgents(
  store: WorkspaceStore,
  own: Workspace,
): Promise<ReachableAgent[]> {
  const workspaces = await store.listWorkspacesForUser(own.ownerUserId);
  const ordered = [
    own,
    ...workspaces.filter(
      (w) => w.id !== own.id && w.ownerUserId === own.ownerUserId,
    ),
  ];
  const out: ReachableAgent[] = [];
  for (const workspace of ordered) {
    for (const agent of await store.listAgents(workspace.id)) {
      if (isAddressableAgent(agent)) out.push({ workspace, agent });
    }
  }
  return out;
}

export async function reachableAgentsForWorkspace(
  store: WorkspaceStore,
  workspaceId: WorkspaceId,
): Promise<ReachableAgent[]> {
  const own = await store.getWorkspace(workspaceId);
  return own ? reachableAgents(store, own) : [];
}

export function qualifiedAgentName(entry: ReachableAgent): string {
  return qualifiedAgentRef(toRef(entry));
}

export function matchAgentRefs(
  reachable: readonly ReachableAgent[],
  ref: string,
): ReachableAgent[] {
  return matchRefs(
    reachable.map((entry) => ({ ...toRef(entry), entry })),
    ref,
  ).map((match) => match.entry);
}

export function agentDirectory(reachable: readonly ReachableAgent[]): string {
  return agentRefDirectory(reachable.map(toRef));
}
