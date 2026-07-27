import { isSetupChatMode } from "../../lib/integration-chat-setup.ts";
import type { ReadCursorStore } from "../../lib/read-cursors.ts";
import {
  countUnreadByAgentPath,
  type UnreadConversationInput,
} from "../../lib/unread-model.ts";

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
  /** Missions that moved since I last read them (HOU-945). Always 0 off
   *  multiplayer or without a signed-in user, so single-player / desktop
   *  renders no new chrome. */
  unreadCount: number;
}

/** Everything the unread count needs: the reader's cursors and who they are. */
export interface UnreadSummaryOptions {
  store: ReadCursorStore;
  selfId: string | null;
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
 * `unreadCount` is always 0 here, and cannot be anything else: a board row
 * carries no attribution (no `created_by`, no `mentioned`), so there is nothing
 * to decide relevance against. The aggregate path below owns the unread number,
 * and this fallback simply reports none rather than guessing one.
 */
export function summarizeActivities(
  activities: ActivitySummaryInput[],
): AgentActivitySummary {
  const summary: AgentActivitySummary = {
    needsYouCount: 0,
    runningCount: 0,
    unreadCount: 0,
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
 * `unread` is OPTIONAL, and its absence (or a null `selfId`) leaves every
 * `unreadCount` at 0 — so single-player and desktop render exactly the chrome
 * they render today, with no new dot to explain. That absence is how the gate
 * is expressed: the sidebar hook omits the option entirely unless the
 * deployment advertises `capabilities.multiplayer`. The counting itself is
 * delegated to {@link countUnreadByAgentPath} rather than re-derived here: the
 * badge, the Mentions inbox and the notifier must agree on what "unread" means,
 * and they only can if there is one implementation of it.
 */
export function buildAgentActivitySummaries(
  agents: AgentActivitySummaryInput[],
  conversations: ActivityConversationSummaryInput[],
  unread?: UnreadSummaryOptions,
): Record<string, AgentActivitySummary> {
  const summaries: Record<string, AgentActivitySummary> = {};
  const agentIdByPath = new Map<string, string>();

  for (const agent of agents) {
    summaries[agent.id] = {
      needsYouCount: 0,
      runningCount: 0,
      unreadCount: 0,
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

  if (unread) {
    const byPath = countUnreadByAgentPath(
      conversations,
      unread.store,
      unread.selfId,
    );
    for (const [agentPath, count] of Object.entries(byPath)) {
      const agentId = agentIdByPath.get(agentPath);
      const summary = agentId ? summaries[agentId] : undefined;
      if (summary) summary.unreadCount = count;
    }
  }

  return summaries;
}
