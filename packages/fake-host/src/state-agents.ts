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
  type FakeAssignment,
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

// ---- Teams v2 access (multiplayer) ----

/** One armed Teams agent for the per-member access lens (`/__test__/org`). */
export interface AgentAccessSeed {
  id: string;
  name: string;
  /** Explicit roster; omit (or an empty array with `everyone`) for org-wide. */
  assignments?: FakeAssignment[];
  /** `true` = shared with everyone (empty assignee set = the everyone sentinel). */
  everyone?: boolean;
  /**
   * The SERVED caller's effective access on this agent (`GET /agents` `access`).
   * Defaults to `manager` (the owner/manager lens). Arm `"user"` to serve a
   * plain member who can only USE the agent — the read-only Permissions tab.
   */
  access?: FakeAssignment["access"];
}

/**
 * Replace the agent fleet with a Teams-shaped set carrying per-agent
 * assignments, so `GET /agents` serves the access fields the per-member lens
 * reads (`assignedUserIds`/`assignments`/`access`). The served caller's `access`
 * defaults to `manager` (the owner/manager lens) and can be armed to `user` for
 * the plain-member read-only view. `everyone` agents get the empty-assignee
 * sentinel.
 */
export function armAgents(seed: AgentAccessSeed[]): CpAgent[] {
  state.agents = seed.map((row) => {
    const assignments = row.everyone ? [] : (row.assignments ?? []);
    return {
      id: row.id,
      workspaceId: SEED_WORKSPACE_ID,
      name: row.name,
      createdAt: EPOCH,
      access: row.access ?? "manager",
      assignments,
      assignedUserIds: assignments.map((a) => a.userId),
    };
  });
  emitDomain("AgentsChanged");
  return state.agents;
}

/**
 * Set-replace one agent's assignee roster (the `PUT /v1/agents/:slug/assignments`
 * body), mirroring the real gateway. Recomputes `assignedUserIds` so a
 * subsequent `GET /agents` reflects the write. Returns `null` for an unknown id.
 */
export function setAgentAssignments(
  agentId: string,
  assignments: FakeAssignment[],
): CpAgent | null {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return null;
  agent.assignments = assignments;
  agent.assignedUserIds = assignments.map((a) => a.userId);
  emitDomain("AgentsChanged");
  return agent;
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
