import type { Activity } from "../data/activity";
import type { PendingWarmingSend } from "./agent-provisioning/entry";

function warmingBoardRows(
  pendingSends: PendingWarmingSend[] | undefined,
  since: number,
): Activity[] {
  const rows: Activity[] = [];
  for (const send of pendingSends ?? []) {
    if (!send.row) continue;
    rows.push({
      id: send.row.id,
      title: send.row.title,
      description: send.row.description,
      status: send.row.status ?? "running",
      session_key: send.sessionKey,
      agent: send.row.agent,
      provider: send.row.provider,
      model: send.row.model,
      updated_at: new Date(send.queuedAt ?? since).toISOString(),
    });
  }
  return rows;
}

export function mergeWarmingRows<T extends { id: string }>(
  fetched: T[] | undefined,
  warming: T[],
): T[] | undefined {
  if (warming.length === 0) return fetched;
  const seen = new Set((fetched ?? []).map((a) => a.id));
  return [...(fetched ?? []), ...warming.filter((r) => !seen.has(r.id))];
}

export interface WarmingAgentRef {
  id: string;
  folderPath: string;
  name: string;
}

interface WarmingEntry {
  since: number;
  pendingSends?: PendingWarmingSend[];
}

export interface WarmingConversation {
  id: string;
  title: string;
  description?: string;
  status?: string;
  type: "activity";
  session_key: string;
  updated_at?: string;
  agent_path: string;
  agent_name: string;
  agent?: string;
}

export function warmingConversations(
  agents: readonly WarmingAgentRef[],
  provisioning: Record<string, WarmingEntry | undefined>,
): WarmingConversation[] {
  const rows: WarmingConversation[] = [];
  for (const agent of agents) {
    const entry = provisioning[agent.id];
    if (!entry) continue;
    for (const row of warmingBoardRows(entry.pendingSends, entry.since)) {
      rows.push({
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        type: "activity",
        session_key: row.session_key ?? `activity-${row.id}`,
        updated_at: row.updated_at,
        agent_path: agent.folderPath,
        agent_name: agent.name,
        ...(row.agent ? { agent: row.agent } : {}),
      });
    }
  }
  return rows;
}
