import { isSetupChatMode } from "../../lib/integration-chat-setup.ts";
import { ARCHIVED_STATUS } from "../../lib/mission-selection.ts";
import type { TeamView } from "../../lib/teams-model.ts";
import type { AgentActivitySummary } from "../shell/agent-activity-summary-model.ts";

/**
 * The mobile Agents home's pure rules: which agents the list shows, in what
 * order, what each row says about its agent, and how the team filter narrows
 * it. Store-free so `app/tests/agents-home-model.test.ts` pins the sort, the
 * preview and the filter without rendering anything. One agent's own task list
 * has its own rules, next door in `agent-missions-model.ts`.
 *
 * Counts are NOT recomputed here: a row takes the same per-agent summaries the
 * nav bar and the rail badges read (`useAgentActivitySummaries`), so the chip
 * on a row can never disagree with the badge that led the user to it.
 */

/** The agent fields a home row needs. */
export interface AgentHomeAgent {
  id: string;
  name: string;
  folderPath: string;
  color?: string;
}

/** A swept conversation row, the bits the home surfaces read
 *  (`RawConversation`). */
export interface AgentHomeConversation {
  id: string;
  title: string;
  /** The task's own one-line description, when it has one. */
  description?: string;
  status?: string | null;
  type: "primary" | "activity";
  agent_path: string;
  /** Agent-mode id; setup chats never appear on the home surfaces. */
  agent?: string | null;
  updated_at?: string;
}

export interface AgentHomeRow {
  agent: AgentHomeAgent;
  needsYouCount: number;
  runningCount: number;
  /** The agent's visible (live, non-archived) tasks. Two or more is what
   *  makes the row's avatar a STACK: the agent holds several conversations. */
  taskCount: number;
  /** The title of the agent's most recently moved task, the row's preview
   *  line. `null` when the agent has no visible task. */
  latestTitle: string | null;
  /** Epoch ms of the most recent movement, or null when unknown. The band's
   *  tie-break and the row's trailing time. */
  lastAt: number | null;
}

/** A board row the home surfaces count as the agent's visible work: a real
 *  mission (not a setup chat), not archived. */
function isHomeMission(row: AgentHomeConversation): boolean {
  if (row.type !== "activity") return false;
  if (isSetupChatMode(row.agent)) return false;
  return row.status !== ARCHIVED_STATUS;
}

export function updatedAtMs(row: AgentHomeConversation): number {
  const parsed = row.updated_at ? Date.parse(row.updated_at) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * The home list, attention-sorted: agents with missions waiting on the user
 * first, then agents with running work, then everyone else — and inside each
 * band the most recently active agent leads, with the agent's name breaking
 * exact ties so the order is stable across refetches.
 *
 * The preview is the LATEST task's title: on an exact timestamp tie the first
 * row in sweep order wins, so two tasks moved in the same second cannot swap
 * the preview between refetches.
 */
export function agentHomeRows(
  agents: readonly AgentHomeAgent[],
  conversations: readonly AgentHomeConversation[] | undefined,
  summaries: Record<string, AgentActivitySummary>,
): AgentHomeRow[] {
  const latestByPath = new Map<string, AgentHomeConversation>();
  const countByPath = new Map<string, number>();
  for (const row of conversations ?? []) {
    if (!isHomeMission(row)) continue;
    countByPath.set(row.agent_path, (countByPath.get(row.agent_path) ?? 0) + 1);
    const held = latestByPath.get(row.agent_path);
    if (!held || updatedAtMs(row) > updatedAtMs(held))
      latestByPath.set(row.agent_path, row);
  }
  const rows = agents.map((agent): AgentHomeRow => {
    const latest = latestByPath.get(agent.folderPath) ?? null;
    return {
      agent,
      needsYouCount: summaries[agent.id]?.needsYouCount ?? 0,
      runningCount: summaries[agent.id]?.runningCount ?? 0,
      taskCount: countByPath.get(agent.folderPath) ?? 0,
      latestTitle: latest?.title ?? null,
      lastAt: latest ? updatedAtMs(latest) || null : null,
    };
  });
  const band = (r: AgentHomeRow) =>
    r.needsYouCount > 0 ? 0 : r.runningCount > 0 ? 1 : 2;
  return rows.sort(
    (a, b) =>
      band(a) - band(b) ||
      (b.lastAt ?? 0) - (a.lastAt ?? 0) ||
      a.agent.name.localeCompare(b.agent.name),
  );
}

/**
 * The team the home's filter is standing on: the chosen team, or `null` for
 * "all teams" — which is also what a chosen id the roster no longer holds
 * resolves to, so a team deleted under an open filter widens the list back
 * out instead of emptying it.
 */
export function agentHomeFilterTeam(
  teams: readonly TeamView[],
  teamId: string | null,
): TeamView | null {
  if (teamId === null) return null;
  return teams.find((team) => team.id === teamId) ?? null;
}

/** Whether the home offers the team filter at all: a workspace with only its
 *  default team has nothing to narrow by, and a control that offers one
 *  choice is a control that lies. */
export function agentHomeHasTeamFilter(teams: readonly TeamView[]): boolean {
  return teams.length > 1;
}

/** The rows under the filter: every row, or the chosen team's members in the
 *  attention order {@link agentHomeRows} produced. */
export function agentRowsForTeam(
  rows: readonly AgentHomeRow[],
  team: TeamView | null,
): AgentHomeRow[] {
  if (team === null) return [...rows];
  const members = new Set(team.agents.map((a) => a.id));
  return rows.filter((row) => members.has(row.agent.id));
}
