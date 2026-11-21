import type { MissionStarter } from "@houston/protocol";
import { isSetupChatMode } from "../../lib/integration-chat-setup.ts";
import { ARCHIVED_STATUS } from "../../lib/mission-selection.ts";
import type { TeamView } from "../../lib/teams-model.ts";
import type { AgentActivitySummary } from "../shell/agent-activity-summary-model.ts";

export interface AgentHomeAgent {
  id: string;
  name: string;
  folderPath: string;
  color?: string;
}

export interface AgentHomeConversation {
  id: string;
  title: string;
  description?: string;
  status?: string | null;
  type: "primary" | "activity";
  agent_path: string;
  agent?: string | null;
  updated_at?: string;
  last_message_at?: string;
  routine_id?: string;
  origin_session_key?: string;
  origin_agent?: string;
  started_by?: MissionStarter;
}

export interface AgentHomeRow {
  agent: AgentHomeAgent;
  needsYouCount: number;
  runningCount: number;
  taskCount: number;
  latestTitle: string | null;
  lastAt: number | null;
}

function isHomeMission(row: AgentHomeConversation): boolean {
  if (row.type !== "activity") return false;
  if (isSetupChatMode(row.agent)) return false;
  return row.status !== ARCHIVED_STATUS;
}

export function updatedAtMs(row: AgentHomeConversation): number {
  const parsed = row.updated_at ? Date.parse(row.updated_at) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

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

export function agentHomeFilterTeam(
  teams: readonly TeamView[],
  teamId: string | null,
): TeamView | null {
  if (teamId === null) return null;
  return teams.find((team) => team.id === teamId) ?? null;
}

export function agentHomeHasTeamFilter(teams: readonly TeamView[]): boolean {
  return teams.length > 0;
}

export function agentRowsForTeam(
  rows: readonly AgentHomeRow[],
  team: TeamView | null,
): AgentHomeRow[] {
  if (team === null) return [...rows];
  const members = new Set(team.agents.map((a) => a.id));
  return rows.filter((row) => members.has(row.agent.id));
}

export type AgentHomePreview =
  | { kind: "typing" }
  | { kind: "latest"; title: string }
  | { kind: "none" };

export function agentHomePreview(
  row: Pick<AgentHomeRow, "runningCount" | "latestTitle">,
): AgentHomePreview {
  if (row.runningCount > 0) return { kind: "typing" };
  if (row.latestTitle !== null)
    return { kind: "latest", title: row.latestTitle };
  return { kind: "none" };
}
