import { isSetupChatMode } from "../../lib/integration-chat-setup.ts";
import type { UnreadConversationInput } from "../../lib/unread-model.ts";
import {
  createHeadlineTracker,
  type MissionHeadline,
} from "./mission-headline-model.ts";

export interface AgentActivitySummaryInput {
  id: string;
  folderPath: string;
}

export interface ActivityConversationSummaryInput
  extends UnreadConversationInput {
  status?: string | null;
  title?: string;
}

export type WorkHistory = "unknown" | "none" | "some";

export interface AgentActivitySummary {
  needsYouCount: number;
  runningCount: number;
  headline: MissionHeadline | null;
  history: WorkHistory;
}

function historyOf(rowCount: number, wasRead: boolean): WorkHistory {
  if (rowCount > 0) return "some";
  return wasRead ? "none" : "unknown";
}

export interface TeamActivityRollup {
  needsYouCount: number;
  runningCount: number;
}

export function teamActivityRollup(
  agentIds: readonly string[],
  summaries: Record<string, AgentActivitySummary>,
): TeamActivityRollup {
  let needsYouCount = 0;
  let runningCount = 0;
  for (const agentId of agentIds) {
    const summary = summaries[agentId];
    if (!summary) continue;
    needsYouCount += summary.needsYouCount;
    runningCount += summary.runningCount;
  }
  return { needsYouCount, runningCount };
}

export interface ActivitySummaryInput {
  status?: string | null;
  agent?: string | null;
  title?: string;
  updated_at?: string;
}

export function summarizeActivities(
  activities: ActivitySummaryInput[],
  wasRead: boolean,
): AgentActivitySummary {
  const summary: AgentActivitySummary = {
    needsYouCount: 0,
    runningCount: 0,
    headline: null,
    history: historyOf(activities.length, wasRead),
  };
  const headline = createHeadlineTracker();
  for (const activity of activities) {
    if (isSetupChatMode(activity.agent)) continue;
    headline.note(activity);
    if (activity.status === "needs_you") {
      summary.needsYouCount += 1;
    } else if (activity.status === "running") {
      summary.runningCount += 1;
    }
  }
  summary.headline = headline.headline();
  return summary;
}

export function buildAgentActivitySummaries(
  agents: AgentActivitySummaryInput[],
  conversations: ActivityConversationSummaryInput[],
  wasRead: (agentPath: string) => boolean,
): Record<string, AgentActivitySummary> {
  const summaries: Record<string, AgentActivitySummary> = {};
  const agentIdByPath = new Map<string, string>();
  const taskRows = new Map<string, number>();
  const headlines = new Map<string, ReturnType<typeof createHeadlineTracker>>();

  for (const agent of agents) {
    summaries[agent.id] = {
      needsYouCount: 0,
      runningCount: 0,
      headline: null,
      history: "unknown",
    };
    agentIdByPath.set(agent.folderPath, agent.id);
    headlines.set(agent.id, createHeadlineTracker());
  }

  for (const conversation of conversations) {
    if (conversation.type !== "activity") continue;
    const agentId = agentIdByPath.get(conversation.agent_path);
    if (!agentId) continue;
    taskRows.set(agentId, (taskRows.get(agentId) ?? 0) + 1);
    if (isSetupChatMode(conversation.agent)) continue;

    const summary = summaries[agentId];
    if (!summary) continue;

    headlines.get(agentId)?.note(conversation);
    if (conversation.status === "needs_you") {
      summary.needsYouCount += 1;
    } else if (conversation.status === "running") {
      summary.runningCount += 1;
    }
  }

  for (const agent of agents) {
    const summary = summaries[agent.id];
    if (!summary) continue;
    summary.headline = headlines.get(agent.id)?.headline() ?? null;
    summary.history = historyOf(
      taskRows.get(agent.id) ?? 0,
      wasRead(agent.folderPath),
    );
  }

  return summaries;
}
