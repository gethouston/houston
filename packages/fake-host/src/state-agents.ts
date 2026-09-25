/**
 * Agents and their `.houston/**` files-first store — the create/rename/delete
 * writers plus raw agent-file read/write, all over the shared {@link state}.
 */

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

/** A config write as the real host stores it: the first-day fields are the
 *  host's (`keepHostOwnedConfig`), whatever the written document says. */
function surfaceConfigWrite(stored: string, content: string): string {
  const incoming = objectIn(content);
  if (!incoming) return content;
  return JSON.stringify(keepHostOwnedConfig(incoming, objectIn(stored) ?? {}));
}

// ---- agents ----
/** The roster as `GET /agents` serves it: each agent with the role its job
 *  description names, like the real host. */
export function listAgents(): CpAgent[] {
  return state.agents.map((agent) => {
    const role = roleOf(agent.id);
    return role ? { ...agent, role } : agent;
  });
}
/** `claudeMd` is the job description the create request carries (the real host
 *  writes it to `CLAUDE.md` before the agent ever runs), so a surface that
 *  reads the file back sees what creation put there. */
export function createAgent(
  name: string,
  claudeMd?: string,
  seeds?: Record<string, string>,
): CpAgent {
  const agent: CpAgent = {
    id: `agent-${++state.agentSeq}`,
    workspaceId: SEED_WORKSPACE_ID,
    name,
    createdAt: EPOCH,
  };
  state.agents.push(agent);
  state.files.set(fileKey(agent.id, ACTIVITY_PATH), "[]");
  if (claudeMd) state.files.set(fileKey(agent.id, JOB_DESCRIPTION), claudeMd);
  // The create's seed map, written before the agent answers, like the real
  // host: a new hire's config (its pending first day) rides it.
  for (const [relPath, content] of Object.entries(seeds ?? {}))
    state.files.set(fileKey(agent.id, relPath), content);
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
   * plain member who can only USE the agent — the read-only Settings access rows.
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
  const roleBefore = relPath === JOB_DESCRIPTION ? roleOf(agentId) : undefined;
  state.files.set(
    fileKey(agentId, relPath),
    relPath === CONFIG_SEED_KEY
      ? surfaceConfigWrite(readAgentFile(agentId, relPath), content)
      : content,
  );
  // The real file watcher fires ActivityChanged when the board file is written.
  if (relPath === ACTIVITY_PATH) emitDomain("ActivityChanged", agentId);
  // ...and the real host announces a job description whose role moved, once
  // the listing already serves the new one (`agent-role/role-tracker.ts`).
  if (relPath === JOB_DESCRIPTION && roleOf(agentId) !== roleBefore)
    emitDomain("AgentRoleChanged", agentId);
  // ...and classifies a SKILL.md write as SkillsChanged: the Skills dialogs'
  // fan-out save is a plain file write, so the list must re-serve it.
  const skillSlug = relPath.match(SKILL_FILE)?.[1];
  if (skillSlug) writeSkillFile(agentId, skillSlug, content);
}
