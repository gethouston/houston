import type { KanbanItem } from "@houston-ai/board";
import { useCallback, useEffect, useMemo } from "react";
import { openMissionChat } from "../../lib/mission-chat";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import type { BoardSource } from "../board/board-source";
import { missionControlDraftScope } from "../board/mission-control-scope";
import { useMcActions } from "../board/use-mc-actions";
import { useMissionControl } from "../use-mission-control";

const noop = () => {};

/**
 * The {@link BoardSource} behind the phone's pushed mission-chat screen: the
 * SAME cross-agent sweep and per-agent action routing the boards read
 * (`useMissionControl` + `useMcActions`, the one-sweep rule), narrowed to a
 * chat-only shape — no board is rendered, so the board-only members (search,
 * selection, auto-open, toolbar) are inert.
 *
 * Selection is the NAV STACK's, not local state: the open mission is the
 * pushed entry's `chatMissionId`. Selecting another mission (a child-mission
 * link, the parent-mission bar) pushes that chat; the draft chat adopting its
 * just-created mission replaces in place so back never revisits the blank
 * composer; deselecting closes the screen.
 */
export function useMissionChatSource(
  agents: Agent[],
  agent: Agent,
  missionId: string | null,
): BoardSource {
  const mc = useMissionControl(agents);

  // Mirror the nav-owned selection into the data hook so the open
  // conversation's feed, session key and VM subscription track the screen.
  useEffect(() => {
    if (mc.selectedId !== missionId) mc.setSelectedId(missionId);
  }, [mc.selectedId, mc.setSelectedId, missionId]);

  const paths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const actions = useMcActions({ mc, activeAgent: agent, paths });

  const setSelectedId = useCallback(
    (id: string | null) => {
      if (id === null) {
        useUIStore.getState().closeMissionChat();
        return;
      }
      if (id !== missionId) {
        openMissionChat(agent, id, {
          nav: missionId === null ? "replace" : "push",
        });
      }
    },
    [agent, missionId],
  );

  // Removing the open mission (delete, archive) removes the screen's subject:
  // close the chat instead of stranding a dead composer over it.
  const closeIfOpen = useCallback(
    (item: KanbanItem) => {
      if (item.id === missionId) useUIStore.getState().closeMissionChat();
    },
    [missionId],
  );
  const onDelete = useCallback(
    async (item: KanbanItem) => {
      await mc.handleDelete(item);
      closeIfOpen(item);
    },
    [mc.handleDelete, closeIfOpen],
  );
  const onArchive = useCallback(
    async (item: KanbanItem) => {
      await mc.handleArchive(item);
      closeIfOpen(item);
    },
    [mc.handleArchive, closeIfOpen],
  );

  const selectedItem = missionId
    ? (mc.items.find((i) => i.id === missionId) ?? null)
    : null;

  return {
    items: mc.items,
    allItems: mc.items,
    feedItems: mc.feedItems,
    loading: mc.loading,
    isLoaded: mc.isLoaded,
    selectedId: missionId,
    setSelectedId,
    highlightedId: null,
    setHighlightedId: noop,
    activeAgent: agent,
    // The Mission Control scopes' draft store, so text parked in a mission's
    // composer follows the mission across surfaces.
    draftScope: missionControlDraftScope(),
    selectedSessionKey: mc.activeSessionKey,
    selectedAgentPath: mc.activeAgentPath,
    onSelectSession: setSelectedId,
    sessionKeyFor: actions.sessionKeyFor,
    onDelete,
    onApprove: mc.handleApprove,
    onArchive,
    onRename: mc.handleRename,
    loadHistory: mc.loadHistory,
    onLoadOlderMessages: mc.onLoadOlderMessages,
    hasOlderMessages: mc.hasOlderMessages,
    sendMessageNow: actions.sendMessageNow,
    createConversation: actions.createConversation,
    stopSession: actions.stopSession,
    // Chat-only: no board is rendered, so the board-only contract is inert.
    registerOpener: noop,
    openerReady: true,
    openNewMission: noop,
    onAutoOpenEmpty: noop,
    autoOpenKey: "mission-chat",
    autoOpenItemCount: mc.items.length,
    autoOpenBlocked: true,
    hasSearchQuery: false,
    panelAgentName: agent.name,
    selectedRunning: selectedItem?.status === "running",
  };
}
