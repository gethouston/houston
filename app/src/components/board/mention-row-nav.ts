/**
 * The one navigation a mention notification performs, shared by the Mission
 * Control inbox and the header bell so a row can never land two different
 * places: make the agent current, open the board its missions live on —
 * its TEAM's Mission Control, filtered to that agent ({@link openAgentBoard}) —
 * and publish the mission for that board to open. The same three-step nav a
 * completion notification does.
 */

import { activityIdForSessionKey } from "../../lib/notification-nav";
import { openAgentBoard } from "../../lib/open-agent";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import type {
  MentionInboxConversation,
  MentionInboxRow,
} from "./mentions-inbox-model";

export function openMentionRow(
  agents: readonly Agent[],
  conversations: readonly MentionInboxConversation[],
  row: MentionInboxRow,
): void {
  // Rows are built from these very agents' conversations, so the lookup
  // always hits; the guard only keeps a roster reload mid-click harmless.
  const agent = agents.find((a) => a.folderPath === row.agentPath);
  if (!agent) return;
  const activityId =
    activityIdForSessionKey(
      conversations.filter((c) => c.agent_path === row.agentPath),
      row.sessionKey,
    ) ?? row.conversationId;
  useAgentStore.getState().setCurrent(agent);
  openAgentBoard(agent.id);
  useUIStore.getState().setActivityPanelId(activityId, { forceOpen: true });
}
