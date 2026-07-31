import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useActivity,
  useChatHistory,
  useDeleteActivity,
  useUpdateActivity,
} from "../../hooks/queries";
import { useConversationVm } from "../../hooks/use-conversation-vm";
import { useWarmingBoardRows } from "../../hooks/use-warming-board-rows";
import { armMissionDoneCelebration } from "../../lib/mission-done-celebration";
import {
  ARCHIVED_STATUS,
  canDropMission,
  DONE_STATUS,
} from "../../lib/mission-selection";
import {
  type HistoryLoadOptions,
  tauriActivity,
  tauriChat,
} from "../../lib/tauri";
import type { Agent, AgentDefinition } from "../../lib/types";
import { mergeWarmingRows } from "../../lib/warming-board-rows";
import { useUIStore } from "../../stores/ui";
import { missionColumnIdForStatus } from "../mission-board-columns";
import { buildAgentBoardItems } from "./agent-board-items";

const EMPTY_FEED: FeedItem[] = [];

/**
 * Per-agent board data: maps this agent's activities to kanban items, exposes
 * its feed slice, and the card-level mutations (delete / approve / archive /
 * rename / drag-move / history). Archived missions live in their own tab, so
 * they're kept off the active board here.
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
  const { data: fetchedItems } = useActivity(path);
  const deleteActivity = useDeleteActivity(path);
  const updateActivity = useUpdateActivity(path);

  // While the engine warms up the list read above is held for the whole cold
  // start — overlay the queued missions so the card shows up as `running` the
  // moment the user sends it (HOU-713). Identity pass-through when nothing is
  // queued, so the normal path (including its `undefined` = "still loading"
  // contract) is untouched.
  const warmingRows = useWarmingBoardRows(agent.id);
  const rawItems = useMemo(
    () => mergeWarmingRows(fetchedItems, warmingRows),
    [fetchedItems, warmingRows],
  );

  const items: KanbanItem[] = useMemo(
    () =>
      buildAgentBoardItems({
        activities: rawItems ?? [],
        agentName: agent.name,
        agentModes,
        routineLabel: t("board:tags.routine"),
      }),
    [agent.name, agentModes, rawItems, t],
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
  // Live resync (HOU-731): subscribe the open conversation to the
  // chat-history query key, so a ConversationsChanged event re-reads it and
  // reseeds the VM (see useChatHistory) — turns written by a teammate,
  // another device, or a routine repaint without reselecting the mission.
  useChatHistory(
    activeSessionKey ? path : undefined,
    activeSessionKey ?? undefined,
  );
  const activeVm = useConversationVm(path, activeSessionKey);
  const activeFeed = activeVm?.feed ?? EMPTY_FEED;
  const feedItems = useMemo<Record<string, FeedItem[]>>(
    () => (activeSessionKey ? { [activeSessionKey]: activeFeed } : {}),
    [activeSessionKey, activeFeed],
  );
  // Scroll-up lazy-load (HOU-819): the open chat renders only the transcript's
  // tail window; when older messages exist server-side the panel prepends the
  // previous page as the user scrolls up. `hasOlderMessages` comes off the
  // VM's stamped window, so it flips as pages land.
  const hasOlderMessages = (activeVm?.historyWindow?.earliestLoaded ?? 0) > 0;
  const onLoadOlderMessages = useCallback(async () => {
    if (!activeSessionKey) return;
    await tauriChat.loadOlderHistory(path, activeSessionKey);
  }, [path, activeSessionKey]);

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
  // The card checkmark: the user signing a mission off. The celebration is
  // armed before the write (it measures the card so the burst comes off it) and
  // fired after it lands — a rejection propagates to the global error toast and
  // never celebrates. See armMissionDoneCelebration for the full contract.
  const handleApprove = useCallback(
    async (item: KanbanItem) => {
      const celebrate = armMissionDoneCelebration(item, DONE_STATUS);
      await updateActivity.mutateAsync({
        activityId: item.id,
        update: { status: DONE_STATUS },
      });
      celebrate();
    },
    [updateActivity],
  );
  // The Done card's archive box: the user filing a mission they already signed
  // off. No celebration — the win was the checkmark; this is the tidy-up after
  // it. Archiving drops the card off the active board, so the open panel is
  // closed the same way `handleDelete` and the bulk archive close it.
  const handleArchive = useCallback(
    async (item: KanbanItem) => {
      await updateActivity.mutateAsync({
        activityId: item.id,
        update: { status: ARCHIVED_STATUS },
      });
      if (selectedId === item.id) setSelectedId(null);
    },
    [updateActivity, selectedId, setSelectedId],
  );
  // Drag a card onto another column to change its status. The board only fires
  // this for a column `canDropItem` accepted, so `toColumnId` doubles as the
  // new status. Failure surfaces as a toast rather than a silent swallow, and
  // the celebration follows the same arm-before / fire-after rule as the
  // checkmark above (it also declines a dragged `error` card: those share the
  // Needs you column, and filing a failure away is not a win).
  const handleItemMove = useCallback(
    async (item: KanbanItem, toColumnId: string) => {
      const celebrate = armMissionDoneCelebration(item, toColumnId);
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
        return;
      }
      // Outside the try: a throwing celebration must never read as a failed move.
      celebrate();
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
    onLoadOlderMessages,
    hasOlderMessages,
    handleDelete,
    handleApprove,
    handleArchive,
    handleItemMove,
    canDropItem,
    onRename,
  };
}
