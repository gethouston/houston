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

export function useMissionChatSource(
  agents: Agent[],
  agent: Agent,
  missionId: string | null,
): BoardSource {
  const mc = useMissionControl(agents);

  useEffect(() => {
    if (mc.selectedId !== missionId) mc.setSelectedId(missionId);
  }, [mc.selectedId, mc.setSelectedId, missionId]);

  const paths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const actions = useMcActions({ mc, activeAgent: agent, paths });

  const setSelectedId = useCallback(
    (id: string | null) => {
      const ui = useUIStore.getState();
      if (ui.chatAgentId !== agent.id || ui.chatMissionId !== missionId) return;
      if (id === null) {
        ui.closeMissionChat();
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

  const closeIfOpen = useCallback(
    (item: KanbanItem) => {
      if (item.id === missionId) useUIStore.getState().closeMissionChat();
    },
    [missionId],
  );
  const onDelete = useCallback(
    (item: KanbanItem) => {
      mc.handleDelete(item);
      closeIfOpen(item);
    },
    [mc.handleDelete, closeIfOpen],
  );
  const onArchive = useCallback(
    (item: KanbanItem) => {
      mc.handleArchive(item);
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
    registerOpener: noop,
    openerReady: true,
    openNewMission: noop,
    onAutoOpenEmpty: noop,
    autoOpenKey: "mission-chat",
    autoOpenItemCount: mc.items.length,
    autoOpenBlocked: true,
    firstDay: { kind: "none" },
    search: { query: "", setQuery: noop, isSearchingText: false },
    hasSearchQuery: false,
    panelAgentName: agent.name,
    selectedRunning: selectedItem?.status === "running",
  };
}
