import { isSetupChatMode } from "../../lib/integration-chat-setup.ts";

export interface AgentActivitySummaryInput {
  id: string;
  folderPath: string;
}

export interface ActivityConversationSummaryInput {
  agent_path: string;
  type: "primary" | "activity";
  status?: string | null;
  /** Agent-mode id; routine-setup chats never count toward badges. */
  agent?: string | null;
}

export interface AgentActivitySummary {
  needsYouCount: number;
  runningCount: number;
}

/** One agent's board rows (`.houston/activity`), the summary-relevant bits. */
export interface ActivitySummaryInput {
  status?: string | null;
  /** Agent-mode id; routine-setup chats never count toward badges. */
  agent?: string | null;
}

/**
 * Summarize one agent's own activity list — the SAME source (and the same
 * counting rule) as the "Activity N" tab badge in workspace-shell.tsx, used
 * as the sidebar fallback while the all-conversations aggregate has not
 * fetched for the current roster key (cold boot, pods still waking).
 */
export function summarizeActivities(
  activities: ActivitySummaryInput[],
): AgentActivitySummary {
  const summary: AgentActivitySummary = { needsYouCount: 0, runningCount: 0 };
  for (const activity of activities) {
    if (isSetupChatMode(activity.agent)) continue;
    if (activity.status === "needs_you") {
      summary.needsYouCount += 1;
    } else if (activity.status === "running") {
      summary.runningCount += 1;
    }
  }
  return summary;
}

export function buildAgentActivitySummaries(
  agents: AgentActivitySummaryInput[],
  conversations: ActivityConversationSummaryInput[],
): Record<string, AgentActivitySummary> {
  const summaries: Record<string, AgentActivitySummary> = {};
  const agentIdByPath = new Map<string, string>();

  for (const agent of agents) {
    summaries[agent.id] = { needsYouCount: 0, runningCount: 0 };
    agentIdByPath.set(agent.folderPath, agent.id);
  }

  for (const conversation of conversations) {
    if (conversation.type !== "activity") continue;
    if (isSetupChatMode(conversation.agent)) continue;

    const agentId = agentIdByPath.get(conversation.agent_path);
    if (!agentId) continue;

    const summary = summaries[agentId];
    if (!summary) continue;

    if (conversation.status === "needs_you") {
      summary.needsYouCount += 1;
    } else if (conversation.status === "running") {
      summary.runningCount += 1;
    }
  }

  return summaries;
}
