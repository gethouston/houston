import { isSetupChatMode } from "../../lib/integration-chat-setup.ts";
import { ARCHIVED_STATUS } from "../../lib/mission-selection.ts";
import { missionColumnIdForStatus } from "../mission-board-columns.ts";
import type { AgentActivitySummary } from "../shell/agent-activity-summary-model.ts";

/**
 * The mobile Agents home's pure rules: which agents the list shows, in what
 * order, with what preview line — and how one agent's missions split into the
 * screen's sections. Store-free so `app/tests/agents-home-model.test.ts` pins
 * the sort and the sectioning without rendering anything.
 *
 * Counts are NOT recomputed here: a row takes the same per-agent summaries the
 * tab bar and the rail badges read (`useAgentActivitySummaries`), so the chip
 * on a row can never disagree with the badge that led the user to it.
 */

/** The agent fields a home row needs. */
export interface AgentHomeAgent {
  id: string;
  name: string;
  folderPath: string;
  color?: string;
}

/** A swept conversation row, the preview-relevant bits (`RawConversation`). */
export interface AgentHomeConversation {
  id: string;
  title: string;
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
  /** The most recently moved mission's title, or null with no missions. */
  lastTitle: string | null;
  /** Epoch ms of that movement, or null when unknown. */
  lastAt: number | null;
}

/** A board row the home surfaces count as the agent's visible work: a real
 *  mission (not a setup chat), not archived. */
function isHomeMission(row: AgentHomeConversation): boolean {
  if (row.type !== "activity") return false;
  if (isSetupChatMode(row.agent)) return false;
  return row.status !== ARCHIVED_STATUS;
}

function updatedAtMs(row: AgentHomeConversation): number {
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
      lastTitle: latest ? latest.title : null,
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

/** Case-insensitive name filter; a blank query keeps every row. */
export function filterAgentRows(
  rows: readonly AgentHomeRow[],
  query: string,
): AgentHomeRow[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === "") return [...rows];
  return rows.filter((row) =>
    row.agent.name.toLocaleLowerCase().includes(needle),
  );
}

/** One agent's missions, split the way the screen sections them. */
export interface AgentMissionSections {
  needsYou: AgentHomeConversation[];
  running: AgentHomeConversation[];
  done: AgentHomeConversation[];
  archived: AgentHomeConversation[];
}

/**
 * Section one agent's swept rows, newest movement first in every section.
 * The status→section mapping is the board's own (`missionColumnIdForStatus`),
 * so a mission always sits in the same section here as the column it occupies
 * on the board this screen pushes into.
 */
export function agentMissionSections(
  conversations: readonly AgentHomeConversation[] | undefined,
  agentPath: string,
): AgentMissionSections {
  const sections: AgentMissionSections = {
    needsYou: [],
    running: [],
    done: [],
    archived: [],
  };
  for (const row of conversations ?? []) {
    if (row.agent_path !== agentPath) continue;
    if (row.type !== "activity") continue;
    if (isSetupChatMode(row.agent)) continue;
    if (row.status === ARCHIVED_STATUS) {
      sections.archived.push(row);
      continue;
    }
    const column = missionColumnIdForStatus(row.status ?? "");
    if (column === "needs_you") sections.needsYou.push(row);
    else if (column === "running") sections.running.push(row);
    else if (column === "done") sections.done.push(row);
  }
  const byRecency = (a: AgentHomeConversation, b: AgentHomeConversation) =>
    updatedAtMs(b) - updatedAtMs(a);
  sections.needsYou.sort(byRecency);
  sections.running.sort(byRecency);
  sections.done.sort(byRecency);
  sections.archived.sort(byRecency);
  return sections;
}
