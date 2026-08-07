import type { Agent } from "../../lib/types.ts";

/**
 * The two translations between the store's team agent filter and the mission
 * board's. They speak different languages on purpose: the sidebar sets the
 * filter by clicking an agent ROW, so the store holds an agent id, while the
 * board's filter menu works in folder paths (the key every mission card carries).
 *
 * Pure and DOM-free so the round trip is unit-tested
 * (`app/tests/team-agent-filter-model.test.ts`).
 */

/**
 * The folder path the board should filter on, `""` (every agent) when nothing
 * is pinned or when the pinned agent is not in this team any more — a filter
 * naming an agent the team no longer has would empty the board with no visible
 * way to clear it.
 */
export function teamFilterPath(
  agents: Agent[],
  agentId: string | null,
): string {
  if (!agentId) return "";
  return agents.find((a) => a.id === agentId)?.folderPath ?? "";
}

/** The agent id to pin for a folder path picked in the board's filter menu. */
export function teamFilterAgentId(
  agents: Agent[],
  folderPath: string | null,
): string | null {
  if (!folderPath) return null;
  return agents.find((a) => a.folderPath === folderPath)?.id ?? null;
}
