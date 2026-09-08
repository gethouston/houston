import type { Agent, Workspace, WorkspaceId } from "../domain/types";
import type { WorkspaceStore } from "../ports";
import {
  type AgentRef,
  agentRefDirectory,
  matchAgentRefs as matchRefs,
  qualifiedAgentRef,
} from "./agent-refs";

/**
 * WHICH agents a caller can address, and how a written reference matches one.
 *
 * One place, because two surfaces answer the same question and must answer it
 * identically: the mission routes retarget a board at a named agent
 * (`routes/missions-target.ts`), and the assistant dispatcher resolves every
 * agent-identifier parameter of a catalogued operation
 * (`assistant/entity-resolution.ts`). A reference the one accepts and the other
 * spells differently is a bug the user experiences as Houston acting on the
 * wrong agent.
 *
 * The ladder itself lives in agent-refs.ts, over the flat shape a candidate in
 * another pod also has; this module answers only WHICH agents are candidates.
 *
 * Scope is the workspaces of the user who owns the calling agent — never more.
 * Hidden dot-agents (the personal assistant itself, the setup runtime) are
 * synthetic and list-hidden by construction: they are not a place work can go
 * and never a target, so they are absent here and can never match.
 */

export interface ReachableAgent {
  workspace: Workspace;
  agent: Agent;
}

/** A reachable agent as the shared ladder reads it. */
const toRef = ({ workspace, agent }: ReachableAgent): AgentRef => ({
  id: agent.id,
  name: agent.name,
  workspace: workspace.name,
  workspaceId: workspace.id,
});

/** An agent a caller may address. Dot-named agents are Houston's own. */
export function isAddressableAgent(agent: Agent): boolean {
  return !agent.name.startsWith(".");
}

/** Every agent the calling agent's owner can reach, its own workspace first. */
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

/**
 * The same set for a caller known only by the workspace its sandbox token was
 * minted for — the assistant's route, which authenticates an agent, not a user.
 * A workspace that no longer exists yields nothing, so an unresolvable
 * reference is refused with "no agents" rather than resolved against a guess.
 */
export async function reachableAgentsForWorkspace(
  store: WorkspaceStore,
  workspaceId: WorkspaceId,
): Promise<ReachableAgent[]> {
  const own = await store.getWorkspace(workspaceId);
  return own ? reachableAgents(store, own) : [];
}

/** `<Workspace>/<Agent>` — the unambiguous way to name one of two same-named agents. */
export function qualifiedAgentName(entry: ReachableAgent): string {
  return qualifiedAgentRef(toRef(entry));
}

/** Every agent a written reference names — the shared ladder (agent-refs.ts). */
export function matchAgentRefs(
  reachable: readonly ReachableAgent[],
  ref: string,
): ReachableAgent[] {
  return matchRefs(
    reachable.map((entry) => ({ ...toRef(entry), entry })),
    ref,
  ).map((match) => match.entry);
}

/** Every reachable agent, spelled so the reader can pick one and try again. */
export function agentDirectory(reachable: readonly ReachableAgent[]): string {
  return agentRefDirectory(reachable.map(toRef));
}
