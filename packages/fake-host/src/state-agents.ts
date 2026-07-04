/**
 * Agents and their `.houston/**` files-first store — the create/rename/delete
 * writers plus raw agent-file read/write, all over the shared {@link state}.
 */

import { SEED_WORKSPACE_ID } from "./config";
import {
  ACTIVITY_PATH,
  type CpAgent,
  EPOCH,
  emitDomain,
  fileKey,
  state,
} from "./state-store";

// ---- agents ----
export function listAgents(): CpAgent[] {
  return state.agents;
}
export function createAgent(name: string): CpAgent {
  const agent: CpAgent = {
    id: `agent-${++state.agentSeq}`,
    workspaceId: SEED_WORKSPACE_ID,
    name,
    createdAt: EPOCH,
  };
  state.agents.push(agent);
  state.files.set(fileKey(agent.id, ACTIVITY_PATH), "[]");
  emitDomain("AgentsChanged");
  return agent;
}
export function renameAgent(id: string, name: string): CpAgent | null {
  const agent = state.agents.find((a) => a.id === id);
  if (!agent) return null;
  agent.name = name;
  emitDomain("AgentsChanged");
  return agent;
}
export function deleteAgent(id: string): boolean {
  const before = state.agents.length;
  state.agents = state.agents.filter((a) => a.id !== id);
  for (const key of [...state.files.keys()])
    if (key.startsWith(`${id}:`)) state.files.delete(key);
  if (state.agents.length === before) return false;
  emitDomain("AgentsChanged");
  return true;
}

// ---- agent files (.houston/**) ----
export function readAgentFile(agentId: string, relPath: string): string {
  return state.files.get(fileKey(agentId, relPath)) ?? "";
}
export function writeAgentFile(
  agentId: string,
  relPath: string,
  content: string,
): void {
  state.files.set(fileKey(agentId, relPath), content);
  // The real file watcher fires ActivityChanged when the board file is written.
  if (relPath === ACTIVITY_PATH) emitDomain("ActivityChanged", agentId);
}
