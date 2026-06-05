import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useUIStore } from "../../stores/ui";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useMissionControl } from "../use-mission-control";
import { useMissionSearch } from "../use-mission-search";
import { MissionControlToolbar } from "../mission-control-toolbar";
import { MissionBoardEmptyState } from "../mission-board-empty-state";
import { useMcNewMission } from "./use-mc-new-mission";
import { useMcActions } from "./use-mc-actions";
import { useCrossAgentSelection } from "./use-cross-agent-selection";
import type { BoardSource } from "./board-source";
import type { Agent } from "../../lib/types";

/**
 * Builds the {@link BoardSource} for cross-agent Mission Control: every
 * agent's missions on one board, a "which agent?" picker before a new
 * mission, an agent filter + search toolbar, and bulk actions routed per
 * agent. The active agent that scopes the right panel is whichever the
 * selected card belongs to, or the one just picked for a new mission.
 */
export function useMissionControlSource(
  agents: Agent[],
  onShowArchived: () => void,
): BoardSource {
  const { t } = useTranslation(["dashboard", "board"]);
  const getAgentDef = useAgentCatalogStore((s) => s.getById);
  const addToast = useUIStore((s) => s.addToast);

  const mc = useMissionControl(agents);

  const [filterPath, setFilterPath] = useState("");
  const [missionSearchQuery, setMissionSearchQuery] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(mc.selectedId);

  const paths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const agentFilteredItems = useMemo(
    () => (filterPath ? mc.items.filter((i) => i.metadata?.agentPath === filterPath) : mc.items),
    [mc.items, filterPath],
  );
  const visibleAgents = useMemo(
    () => (filterPath ? agents.filter((a) => a.folderPath === filterPath) : agents),
    [agents, filterPath],
  );

  const handleMissionSearchError = useCallback(() => {
    addToast({
      title: t("dashboard:search.historyErrorTitle"),
      description: t("dashboard:search.historyErrorDescription"),
      variant: "error",
    });
  }, [addToast, t]);
  const missionSearch = useMissionSearch({
    items: agentFilteredItems,
    query: missionSearchQuery,
    loadHistory: mc.loadHistory,
    onHistoryLoadError: handleMissionSearchError,
  });

  const newMission = useMcNewMission({
    agents,
    visibleAgents,
    selectedId: mc.selectedId,
    setSelectedId: mc.setSelectedId,
  });

  const selectedItem = mc.selectedId
    ? mc.items.find((i) => i.id === mc.selectedId) ?? null
    : null;
  const activeAgent = useMemo<Agent | null>(() => {
    if (selectedItem) {
      const path = selectedItem.metadata?.agentPath as string | undefined;
      return agents.find((a) => a.folderPath === path) ?? null;
    }
    return newMission.pendingAgent;
  }, [selectedItem, newMission.pendingAgent, agents]);
  const activeAgentDef = activeAgent ? getAgentDef(activeAgent.configId) ?? null : null;
  const selectedSessionKey = selectedItem
    ? (selectedItem.metadata?.sessionKey as string | undefined) ?? `activity-${selectedItem.id}`
    : null;
  const selectedAgentPath = (selectedItem?.metadata?.agentPath as string | undefined) ?? null;
  const selectedSessionActive = selectedSessionKey
    ? (mc.loading[selectedSessionKey] ?? false)
    : false;

  const actions = useMcActions({ mc, activeAgent, activeAgentDef, paths });

  const agentPathForId = useCallback(
    (id: string) => mc.items.find((i) => i.id === id)?.metadata?.agentPath as string | undefined,
    [mc.items],
  );
  const selection = useCrossAgentSelection({
    resetKey: filterPath || "all",
    paths,
    agentPathForId,
  });

  const emptyState = missionSearch.hasQuery ? (
    <MissionBoardEmptyState
      isSearch={missionSearch.hasQuery}
      isSearchingText={missionSearch.isSearchingText}
      labels={{
        emptyTitle: t("dashboard:empty.boardTitle"),
        emptyDescription: t("dashboard:empty.boardDescription"),
        newMission: t("dashboard:empty.newMission"),
        searchEmptyTitle: t("dashboard:search.emptyTitle"),
        searchEmptyDescription: t("dashboard:search.emptyDescription"),
        searchSearchingTitle: t("dashboard:search.searchingTitle"),
        searchSearchingDescription: t("dashboard:search.searchingDescription"),
        clearSearch: t("dashboard:search.clearCta"),
      }}
      onNewMission={newMission.openNewMission}
      onClearSearch={() => setMissionSearchQuery("")}
    />
  ) : undefined;

  const toolbar = (
    <MissionControlToolbar
      agents={agents}
      filterPath={filterPath}
      search={missionSearchQuery}
      isSearchingText={missionSearch.isSearchingText}
      onFilterPathChange={setFilterPath}
      onSearchChange={setMissionSearchQuery}
      archivedActive={false}
      onToggleArchived={onShowArchived}
      onNewMission={newMission.openNewMission}
    />
  );

  return {
    variant: "mission-control",
    items: missionSearch.items,
    allItems: agentFilteredItems,
    feedItems: mc.feedItems,
    loading: mc.loading,
    isLoaded: mc.isLoaded,
    selectedId: mc.selectedId,
    setSelectedId: mc.setSelectedId,
    highlightedId,
    setHighlightedId,
    activeAgent,
    activeAgentDef,
    selectedSessionKey,
    selectedAgentPath,
    selectedSessionActive,
    onSelectSession: mc.setSelectedId,
    sessionKeyFor: actions.sessionKeyFor,
    onDelete: mc.handleDelete,
    onApprove: mc.handleApprove,
    onRename: mc.handleRename,
    loadHistory: mc.loadHistory,
    onHistoryLoaded: mc.handleHistoryLoaded,
    sendMessageNow: actions.sendMessageNow,
    createConversation: actions.createConversation,
    stopSession: actions.stopSession,
    onRunInTerminal: actions.runInTerminal,
    onItemMove: actions.handleItemMove,
    canDropItem: actions.canDropItem,
    selection,
    registerOpener: newMission.registerOpener,
    openerReady: newMission.openerReady,
    openNewMission: newMission.openNewMission,
    onAutoOpenEmpty: newMission.onAutoOpenEmpty,
    autoOpenKey: filterPath || "all",
    autoOpenItemCount: agentFilteredItems.length,
    autoOpenBlocked: newMission.agentPickerOpen,
    hasSearchQuery: missionSearch.hasQuery,
    emptyState,
    panelAgentName: activeAgent?.name ?? selectedItem?.subtitle,
    selectedRunning: selectedItem?.status === "running",
    toolbar,
    dialogs: newMission.dialogs,
  };
}
