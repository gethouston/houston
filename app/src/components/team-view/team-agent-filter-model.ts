import type { Agent } from "../../lib/types.ts";

/**
 * Which agent a team surface is narrowed to, in the two vocabularies the app
 * speaks. They differ on purpose: a filter is CHOSEN by agent (the rail's row,
 * a section's own dropdown), so it is held as an agent id, while a mission
 * board FILTERS on a folder path — the key every mission card carries.
 *
 * The same two translations serve the store's team-wide pin (the board) and a
 * section's own local filter (Routines, Archived), because the question is the
 * same shape either way; only who owns the answer differs.
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

/**
 * The agent a SECTION-LOCAL filter is showing, or `null` for the whole team.
 *
 * An id the team no longer holds resolves to `null` — the same drop rule the
 * pin gets. A team's roster can change while a section sits open (someone
 * moves an agent out, a share is revoked), and a filter naming an agent that
 * is gone would empty the list with a control still claiming to show them.
 */
export function sectionFilterAgent(
  agents: Agent[],
  agentId: string | null,
): Agent | null {
  if (!agentId) return null;
  return agents.find((a) => a.id === agentId) ?? null;
}
