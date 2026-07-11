import { isRoutineSetupMode } from "../../lib/routine-chat-setup.ts";

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
    if (isRoutineSetupMode(conversation.agent)) continue;

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
