import { withDocLock } from "@houston/domain";
import type { Agent, Workspace } from "../domain/types";
import { AgentNameConflictError } from "../ports";
import { type AgentRouteDeps, channelFor } from "./agent-authz";
import { readDoc } from "./agent-delegation-document";
import {
  delegationDocKey,
  moveAgentDelegation,
  readAgentDelegation,
  restoreAgentDelegationEntry,
  writeAgentDelegation,
} from "./agent-delegation-store";

interface RenameInput {
  deps: AgentRouteDeps;
  workspace: Workspace;
  agent: Agent;
  name: string;
}

export function renameWithDelegation({
  deps,
  workspace,
  agent,
  name,
}: RenameInput): Promise<{ renamed: Agent; policyError?: unknown }> {
  const nextId = `${workspace.id}/${name}`;
  const copyPolicy = Boolean(
    deps.vfs && nextId !== agent.id && name !== agent.name,
  );
  // A separate key spans the directory move and policy writes; the policy
  // helpers take the document key themselves and cannot reenter that lock.
  return withAgentPolicyLock(workspace.id, async () => {
    if (name !== agent.name) {
      const siblings = await deps.store.listAgents(workspace.id);
      if (
        siblings.some(
          (sibling) => sibling.name === name && sibling.id !== agent.id,
        )
      )
        throw new AgentNameConflictError(name);
    }
    const vfs = deps.vfs;
    const prior =
      copyPolicy && vfs
        ? (await readDoc(vfs, delegationDocKey(workspace.id))).agents[nextId]
        : undefined;
    const doRename = async (): Promise<Agent> => {
      let attemptedPolicyWrite = false;
      try {
        if (copyPolicy && vfs) {
          const policy = await readAgentDelegation(vfs, workspace.id, agent.id);
          attemptedPolicyWrite = true;
          await writeAgentDelegation(vfs, workspace.id, nextId, policy);
        }
        return await deps.store.renameAgent(agent.id, name);
      } catch (error) {
        if (attemptedPolicyWrite && vfs) {
          try {
            await restoreAgentDelegationEntry(vfs, workspace.id, nextId, prior);
          } catch (rollbackError) {
            throw new AggregateError(
              [error, rollbackError],
              "rename and delegation rollback failed",
              { cause: rollbackError },
            );
          }
        }
        throw error;
      }
    };
    const channel = channelFor(deps, workspace);
    const renamed =
      name !== agent.name && channel?.withQuiesced
        ? await channel.withQuiesced({ workspace, agent }, doRename)
        : await doRename();
    if (!copyPolicy || !vfs) return { renamed };
    try {
      if (renamed.id === nextId)
        await moveAgentDelegation(vfs, workspace.id, agent.id, renamed.id);
      else await restoreAgentDelegationEntry(vfs, workspace.id, nextId, prior);
      return { renamed };
    } catch (error) {
      console.error(
        `[agents] delegation move for ${agent.id} failed after rename:`,
        error,
      );
      await writeAgentDelegation(vfs, workspace.id, renamed.id, {
        mode: "off",
        agents: [],
        acceptsMissions: false,
      });
      return { renamed, policyError: error };
    }
  });
}

/** Serializes agent identity changes with policy writes for one workspace. */
export function withAgentPolicyLock<T>(
  workspaceId: string,
  run: () => Promise<T>,
): Promise<T> {
  return withDocLock(`${delegationDocKey(workspaceId)}:rename`, run);
}
