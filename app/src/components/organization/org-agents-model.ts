import type { Agent } from "@houston-ai/engine-client";

/**
 * Pure, DOM-free reading of an agent's sharing state for the Organization >
 * Agents grid (Teams v2). Turns the wire fields (`assignments` with per-person
 * access, plus the back-compat `assignedUserIds`) into the three facts the card
 * shows: who manages it, whether everyone can use it, and how many people can.
 * Node:test-safe.
 */
export interface AgentAccessSummary {
  /** User ids whose access level is `manager`. */
  managerIds: string[];
  /** True when the agent is shared org-wide (empty assignee set). */
  everyone: boolean;
  /** People-with-access count, or `null` when the caller can't see the set. */
  peopleCount: number | null;
}

export function summarizeAgentAccess(
  agent: Pick<Agent, "assignments" | "assignedUserIds">,
): AgentAccessSummary {
  const ids = agent.assignments?.map((a) => a.userId) ?? agent.assignedUserIds;
  const managerIds =
    agent.assignments
      ?.filter((a) => a.access === "manager")
      .map((a) => a.userId) ?? [];

  if (ids === undefined)
    return { managerIds, everyone: false, peopleCount: null };
  if (ids.length === 0) return { managerIds, everyone: true, peopleCount: 0 };
  return { managerIds, everyone: false, peopleCount: ids.length };
}
