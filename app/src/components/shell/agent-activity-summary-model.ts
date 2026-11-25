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

/**
 * A conversation row as the sidebar summarizes it. It EXTENDS the unread
 * model's input rather than restating the fields (id, `updated_at`, and the
 * `created_by`/`contributors`/`mentioned` attribution) so the two can never
 * drift into disagreeing about what a mission is.
 */
export interface ActivityConversationSummaryInput extends UnreadConversationInput {
  status?: string | null;
  title?: string;
}

/**
 * Whether the agent has ever been given work, as far as this session KNOWS.
 *
 * `none` is only ever a confirmed answer: the agent's slice was read in full
 * this session (`sliceCoverage`) and held no task at all. Anything short of
 * that (cold boot, a pod still waking, a failed read) is `unknown`, so a
 * veteran employee is never shown as brand new while its tasks load.
 */
export type WorkHistory = "unknown" | "none" | "some";

export interface AgentActivitySummary {
  needsYouCount: number;
  runningCount: number;
  /** What the row leads with (`mission-headline-model.ts`); null until the
   *  agent has a live (non-archived, titled) mission. */
  headline: MissionHeadline | null;
  history: WorkHistory;
}

/** Any task row, archived and setup chats included, is work already begun. */
function historyOf(rowCount: number, wasRead: boolean): WorkHistory {
  if (rowCount > 0) return "some";
  return wasRead ? "none" : "unknown";
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
  title?: string;
  updated_at?: string;
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
  /** Whether this agent's slice was read in full this session. */
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

/** The sidebar's per-agent badge numbers and the mission each row names. */
export function buildAgentActivitySummaries(
  agents: AgentActivitySummaryInput[],
  conversations: ActivityConversationSummaryInput[],
  /** Whether an agent's slice was read in full this session. */
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
