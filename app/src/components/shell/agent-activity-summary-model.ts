import { isSetupChatMode } from "../../lib/integration-chat-setup.ts";
import type { UnreadConversationInput } from "../../lib/unread-model.ts";

export interface AgentActivitySummaryInput {
  id: string;
  folderPath: string;
}

/**
 * A conversation row as the sidebar summarizes it. It EXTENDS the unread
 * model's input rather than restating the fields (id, `updated_at`, and the
 * `created_by`/`contributors`/`mentioned` attribution) so the two can never
 * drift into disagreeing about what a mission is.
 */
export interface ActivityConversationSummaryInput
  extends UnreadConversationInput {
  status?: string | null;
}

export interface AgentActivitySummary {
  needsYouCount: number;
  runningCount: number;
}

/** What a TEAM's header says on behalf of the agent rows folded under it. */
export interface TeamActivityRollup {
  /** The sum of its members' needs-you counts. A sum and not a member count:
   *  the badge answers "how much is waiting in here", which is the same
   *  question an agent row's badge answers, one level up. */
  needsYouCount: number;
  /** The sum of its members' running missions. The rail DRAWS it as a ring
   *  (running or not — the same binary an agent row shows) and only ever SAYS
   *  the number, in the ring's accessible label. */
  runningCount: number;
}

/**
 * Roll a team's members up into the one line its header can carry.
 *
 * A folded team draws no agent rows, so everything they were signalling leaves
 * the rail with them — and "collapse this team" must not mean "stop telling me
 * my agents need something". It reads the SAME per-agent summaries the rows
 * do, so a header can never disagree with the rows behind it, and an agent with
 * no summary yet contributes nothing rather than a zero-shaped guess.
 */
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
 *
 */
export function summarizeActivities(
  activities: ActivitySummaryInput[],
): AgentActivitySummary {
  const summary: AgentActivitySummary = {
    needsYouCount: 0,
    runningCount: 0,
  };
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

/**
 * The sidebar's per-agent badge numbers.
 *
 */
export function buildAgentActivitySummaries(
  agents: AgentActivitySummaryInput[],
  conversations: ActivityConversationSummaryInput[],
): Record<string, AgentActivitySummary> {
  const summaries: Record<string, AgentActivitySummary> = {};
  const agentIdByPath = new Map<string, string>();

  for (const agent of agents) {
    summaries[agent.id] = {
      needsYouCount: 0,
      runningCount: 0,
    };
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
