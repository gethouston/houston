import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { messagePreviewText } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useActivity,
  useDeleteActivity,
  useUpdateActivity,
} from "../../hooks/queries";
import { useConversationFeed } from "../../hooks/use-conversation-vm";
import { missionCardTags } from "../../lib/mission-card";
import { canDropMission, selectActive } from "../../lib/mission-selection";
import {
  type HistoryLoadOptions,
  tauriActivity,
  tauriChat,
} from "../../lib/tauri";
import type { Agent, AgentDefinition } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { missionColumnIdForStatus } from "../mission-board-columns";

/**
 * Per-agent board data: maps this agent's activities to kanban items, exposes
 * its feed slice, and the card-level mutations (delete / approve / rename /
 * drag-move / history). Archived missions live in their own tab, so they're
 * kept off the active board here.
 */
export function useAgentBoardData({
  agent,
  agentDef,
  selectedId,
  setSelectedId,
}: {
  agent: Agent;
  agentDef: AgentDefinition;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  const { t } = useTranslation(["board", "dashboard", "chat"]);
  const path = agent.folderPath;
  const agentModes = agentDef.config.agents;
  const addToast = useUIStore((s) => s.addToast);
  const { data: rawItems } = useActivity(path);
  const deleteActivity = useDeleteActivity(path);
  const updateActivity = useUpdateActivity(path);

  const activeRaw = useMemo(() => selectActive(rawItems ?? []), [rawItems]);
  const items: KanbanItem[] = useMemo(
    () =>
      activeRaw.map((activity) => ({
        id: activity.id,
        title: activity.title,
        // A Skill / attachment first message persists as a marker; show the
        // user's words on the card, never the raw `<!--houston:...-->` (HOU-425).
        description: messagePreviewText(activity.description),
        status: activity.status,
        updatedAt: activity.updated_at ?? new Date().toISOString(),
        group: agent.name,
        tags: missionCardTags({
          agent: activity.agent,
          agentModes,
          routineId: activity.routine_id,
          routineLabel: t("board:tags.routine"),
        }),
        metadata: {
          ...(activity.session_key ? { sessionKey: activity.session_key } : {}),
          ...(activity.routine_id ? { routineId: activity.routine_id } : {}),
          ...(activity.agent ? { agent: activity.agent } : {}),
        },
      })),
    [agent.name, agentModes, activeRaw, t],
  );

  const sessionKeyFor = useCallback(
    (activityId: string) => {
      const item = (rawItems ?? []).find((a) => a.id === activityId);
      return item?.session_key ?? `activity-${activityId}`;
    },
    [rawItems],
  );

  // The open conversation's reactive feed from the SDK conversation VM
  // (history seeded by the adapter's loadHistory; live turns folded by the
  // SDK). AIBoard only reads `feedItems[activeSessionKey]`, so the
  // single-entry map is the whole contract.
  const activeSessionKey = selectedId ? sessionKeyFor(selectedId) : null;
  const activeFeed = useConversationFeed(path, activeSessionKey);
  const feedItems = useMemo<Record<string, FeedItem[]>>(
    () => (activeSessionKey ? { [activeSessionKey]: activeFeed } : {}),
    [activeSessionKey, activeFeed],
  );

  const loadHistory = useCallback(
    async (sessionKey: string, opts?: HistoryLoadOptions) => {
      const history = await tauriChat.loadHistory(path, sessionKey, opts);
      return history as FeedItem[];
    },
    [path],
  );

  const handleDelete = useCallback(
    async (item: KanbanItem) => {
      await deleteActivity.mutateAsync(item.id);
      if (selectedId === item.id) setSelectedId(null);
    },
    [deleteActivity, selectedId, setSelectedId],
  );
  const handleApprove = useCallback(
    async (item: KanbanItem) => {
      await updateActivity.mutateAsync({
        activityId: item.id,
        update: { status: "done" },
      });
    },
    [updateActivity],
  );
  // Drag a card onto another column to change its status. The board only fires
  // this for a column `canDropItem` accepted, so `toColumnId` doubles as the
  // new status. Failure surfaces as a toast rather than a silent swallow.
  const handleItemMove = useCallback(
    async (item: KanbanItem, toColumnId: string) => {
      try {
        await updateActivity.mutateAsync({
          activityId: item.id,
          update: { status: toColumnId },
        });
      } catch (err) {
        addToast({
          title: t("board:dnd.moveError", { error: String(err) }),
          variant: "error",
        });
      }
    },
    [updateActivity, addToast, t],
  );
  const canDropItem = useCallback(
    (item: KanbanItem, toColumnId: string) =>
      canDropMission(missionColumnIdForStatus(item.status), toColumnId),
    [],
  );
  const onRename = useCallback(
    (item: KanbanItem, title: string) => {
      tauriActivity.update(path, item.id, { title }).catch(console.error);
    },
    [path],
  );

  return {
    rawItems,
    items,
    feedItems,
    sessionKeyFor,
    loadHistory,
    handleDelete,
    handleApprove,
    handleItemMove,
    canDropItem,
    onRename,
  };
}
