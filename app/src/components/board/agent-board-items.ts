import type { KanbanItem } from "@houston-ai/board";
import { messagePreviewText } from "@houston-ai/chat";
import type { Activity } from "../../data/activity";
import { missionCardTags } from "../../lib/mission-card";
import { selectActive, selectArchived } from "../../lib/mission-selection";
import type { AgentMode } from "../../lib/types";

/**
 * The per-agent board's cards: this agent's ACTIVE missions (archived ones
 * live in their own tab, guided-setup chats never appear as a card) mapped to
 * kanban items. Pure — no hooks, no queries — so the card shape stays testable
 * without mounting the board.
 */
export function buildAgentBoardItems({
  activities,
  agentName,
  agentModes,
  routineLabel,
  agentStartedLabel,
}: {
  activities: Activity[];
  /** Shown as the card's group line — one agent's board, so it's constant. */
  agentName: string;
  agentModes?: Pick<AgentMode, "id" | "name">[];
  /** Translated tag for a mission a routine started. */
  routineLabel: string;
  /** Translated tag for a mission the agent started itself (PRODUCT-1244). */
  agentStartedLabel: string;
}): KanbanItem[] {
  return selectActive(activities).map((activity) => ({
    id: activity.id,
    title: activity.title,
    // A Skill / attachment first message persists as a marker; show the
    // user's words on the card, never the raw `<!--houston:...-->` (HOU-425).
    description: messagePreviewText(activity.description),
    status: activity.status,
    updatedAt: activity.updated_at ?? new Date().toISOString(),
    group: agentName,
    tags: missionCardTags({
      agent: activity.agent,
      agentModes,
      routineId: activity.routine_id,
      routineLabel,
      originSessionKey: activity.origin_session_key,
      agentStartedLabel,
    }),
    metadata: {
      ...(activity.session_key ? { sessionKey: activity.session_key } : {}),
      ...(activity.routine_id ? { routineId: activity.routine_id } : {}),
      ...(activity.agent ? { agent: activity.agent } : {}),
    },
  }));
}

/**
 * The per-agent Archived tab's cards: this agent's ARCHIVED missions, as a
 * column-less list. Deliberately barer than the active board's items — an
 * archived mission carries no routine/mode tag and no status column — but it
 * shares the same "activities in, kanban items out" shape and purity.
 */
export function buildArchivedBoardItems({
  activities,
  agentName,
}: {
  activities: Activity[];
  agentName: string;
}): KanbanItem[] {
  return selectArchived(activities).map((activity) => ({
    id: activity.id,
    title: activity.title,
    // A Skill / attachment first message persists as a marker; show the
    // user's words on the card, never the raw `<!--houston:...-->` (HOU-425).
    description: messagePreviewText(activity.description),
    status: activity.status,
    updatedAt: activity.updated_at ?? new Date().toISOString(),
    group: agentName,
    metadata: {
      ...(activity.session_key ? { sessionKey: activity.session_key } : {}),
    },
  }));
}
