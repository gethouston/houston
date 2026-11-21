import { sameAgentName } from "@houston/domain/agent-name";
import {
  CONFIG_SEED_KEY,
  keepHostOwnedConfig,
} from "@houston/domain/first-day-config";
import { jobDescriptionRole } from "@houston/domain/job-role";
import { SEED_WORKSPACE_ID } from "./config";
import { writeSkillFile } from "./state-skills";
import {
  ACTIVITY_PATH,
  type CpAgent,
  EPOCH,
  emitDomain,
  type FakeAssignment,
  fileKey,
  state,
} from "./state-store";

const SKILL_FILE = /^\.agents\/skills\/([^/]+)\/SKILL\.md$/;
const JOB_DESCRIPTION = "CLAUDE.md";
const roleOf = (agentId: string) =>
  jobDescriptionRole(state.files.get(fileKey(agentId, JOB_DESCRIPTION)));

const objectIn = (raw: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

function surfaceConfigWrite(stored: string, content: string): string {
  const incoming = objectIn(content);
  if (!incoming) return content;
  return JSON.stringify(keepHostOwnedConfig(incoming, objectIn(stored) ?? {}));
}

export function listAgents(orgSlug?: string): CpAgent[] {
  return state.agents.flatMap(({ orgSlug: home, ...agent }) => {
    if (orgSlug !== undefined && home !== undefined && home !== orgSlug)
      return [];
    const role = roleOf(agent.id);
    return [role ? { ...agent, role } : agent];
  });
}
function agentNameTaken(name: string, exceptId?: string): boolean {
  return state.agents.some(
    (agent) => agent.id !== exceptId && sameAgentName(agent.name, name),
  );
}
export function createAgent(
  name: string,
  claudeMd?: string,
  seeds?: Record<string, string>,
): CpAgent | "name_taken" {
  if (agentNameTaken(name)) return "name_taken";
  const agent: CpAgent = {
    id: `agent-${++state.agentSeq}`,
    workspaceId: SEED_WORKSPACE_ID,
    name,
    createdAt: EPOCH,
  };
  state.agents.push(agent);
  state.files.set(fileKey(agent.id, ACTIVITY_PATH), "[]");
  if (claudeMd) state.files.set(fileKey(agent.id, JOB_DESCRIPTION), claudeMd);
  for (const [relPath, content] of Object.entries(seeds ?? {}))
    state.files.set(fileKey(agent.id, relPath), content);
  emitDomain("AgentsChanged");
  return agent;
}
export function renameAgent(
  id: string,
  name: string,
): CpAgent | "not_found" | "name_taken" {
  const agent = state.agents.find((a) => a.id === id);
  if (!agent) return "not_found";
  if (agentNameTaken(name, id)) return "name_taken";
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

export interface AgentAccessSeed {
  id: string;
  name: string;
  assignments?: FakeAssignment[];
  everyone?: boolean;
  access?: FakeAssignment["access"];
}

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

export function readAgentFile(agentId: string, relPath: string): string {
  return state.files.get(fileKey(agentId, relPath)) ?? "";
}
export function writeAgentFile(
  agentId: string,
  relPath: string,
  content: string,
): void {
  const roleBefore = relPath === JOB_DESCRIPTION ? roleOf(agentId) : undefined;
  state.files.set(
    fileKey(agentId, relPath),
    relPath === CONFIG_SEED_KEY
      ? surfaceConfigWrite(readAgentFile(agentId, relPath), content)
      : content,
  );
  if (relPath === ACTIVITY_PATH) emitDomain("ActivityChanged", agentId);
  if (relPath === JOB_DESCRIPTION && roleOf(agentId) !== roleBefore)
    emitDomain("AgentRoleChanged", agentId);
  const skillSlug = relPath.match(SKILL_FILE)?.[1];
  if (skillSlug) writeSkillFile(agentId, skillSlug, content);
}
