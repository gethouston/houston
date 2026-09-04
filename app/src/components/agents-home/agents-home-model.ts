import { isSetupChatMode } from "../../lib/integration-chat-setup.ts";
import { ARCHIVED_STATUS } from "../../lib/mission-selection.ts";
import type { TeamView } from "../../lib/teams-model.ts";
import type { AgentActivitySummary } from "../shell/agent-activity-summary-model.ts";

/**
 * The mobile Agents home's pure rules: which agents the list shows, in what
 * order, and how they group into the phone's team tree. Store-free so
 * `app/tests/agents-home-model.test.ts` pins the sort and the grouping without
 * rendering anything. One agent's own task list has its own rules, next door
 * in `agent-missions-model.ts`.
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
  /** Epoch ms of the most recent movement, or null when unknown. The band's
   *  tie-break; the row itself shows no time. */
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
 */
export function agentHomeRows(
  agents: readonly AgentHomeAgent[],
  conversations: readonly AgentHomeConversation[] | undefined,
  summaries: Record<string, AgentActivitySummary>,
): AgentHomeRow[] {
  const latestByPath = new Map<string, AgentHomeConversation>();
  for (const row of conversations ?? []) {
    if (!isHomeMission(row)) continue;
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

/** One band of the Agents tree: a team and the agents that belong to it. */
export interface AgentTreeSection {
  /** `null` means a FLAT list — the workspace has only its default team, and
   *  naming it would be a header that says nothing the user did not choose. */
  team: TeamView | null;
  rows: AgentHomeRow[];
}

/**
 * The Agents home as a tree: every team that HAS agents, in rail order, with
 * its own agents beneath it in the attention order {@link agentHomeRows}
 * produced.
 *
 * A team with no agents is skipped rather than drawn empty: the tree exists to
 * find an agent, and a header with nothing under it is a dead row. A single
 * (default) team collapses the whole grouping away — with one team the header
 * would be the same word on every screen.
 */
export function agentTreeSections(
  teams: readonly TeamView[],
  rows: readonly AgentHomeRow[],
): AgentTreeSection[] {
  if (rows.length === 0) return [];
  if (teams.length <= 1) return [{ team: null, rows: [...rows] }];
  return teams.flatMap((team) => {
    const members = new Set(team.agents.map((a) => a.id));
    const teamRows = rows.filter((row) => members.has(row.agent.id));
    return teamRows.length === 0 ? [] : [{ team, rows: teamRows }];
  });
}
