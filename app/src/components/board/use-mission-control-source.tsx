import { type ReactNode, useCallback, useMemo, useState } from "react";
import { pendingMissionSurface } from "../../lib/board-surface-nav";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { useFirstDayPlacement } from "../first-day/use-first-day-placement";
import { useMissionControl } from "../use-mission-control";
import type { BoardSource } from "./board-source";
import { McToolbarSlot } from "./mc-toolbar-slot";
import {
  filteredScopeAgent,
  missionControlDraftScope,
} from "./mission-control-scope.ts";
import { useCrossAgentSelection } from "./use-cross-agent-selection";
import { useGettingReadyEmpty } from "./use-getting-ready-empty";
import { useMcActions } from "./use-mc-actions";
import { useMcNewMission } from "./use-mc-new-mission";
import { useMcPersonFilter } from "./use-mc-person-filter";
import { type MissionControlScope, useMcScope } from "./use-mc-scope.ts";
import { useMcSearch } from "./use-mc-search.tsx";
import { usePendingMissionTarget } from "./use-pending-mission-target";

export function useMissionControlSource(
  agents: Agent[],
  scope?: MissionControlScope,
  modeToggle?: ReactNode,
): BoardSource {
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);

  const mc = useMissionControl(agents);

  const pendingId = useUIStore((s) => s.activityPanelId);
  const pendingSurface = pendingMissionSurface(mc.rawConversations, pendingId);
  usePendingMissionTarget({
    surface: "active",
    pendingSurface,
    selectedId: mc.selectedId,
    setSelectedId: mc.setSelectedId,
    missionPanelOpen,
  });

  const [highlightedId, setHighlightedId] = useState<string | null>(
    mc.selectedId,
  );

  const { scopedAgents, paths, agentFilteredItems, visibleAgents, filterPath } =
    useMcScope(agents, mc.items, scope);

  const { filterUserId, setFilterUserId, personFilteredItems } =
    useMcPersonFilter(agentFilteredItems);

  const pinnedAgent = filteredScopeAgent(scopedAgents, filterPath);
  const newMission = useMcNewMission({
    agents: scopedAgents,
    visibleAgents,
    scopedAgents,
    pinnedAgent,
    selectedId: mc.selectedId,
    setSelectedId: mc.setSelectedId,
  });
  const firstDay = useFirstDayPlacement({
    agents: visibleAgents,
    pinnedAgent,
    pinnedTaskCount: agentFilteredItems.length,
  });
  const gettingReady = useGettingReadyEmpty(
    pinnedAgent,
    agentFilteredItems.length,
  );
  const missionSearch = useMcSearch({
    items: personFilteredItems,
    loadHistory: mc.loadHistory,
    onNewMission: newMission.openNewMission,
  });

  const selectedItem = mc.selectedId
    ? (mc.items.find((i) => i.id === mc.selectedId) ?? null)
    : null;
  const activeAgent = useMemo<Agent | null>(() => {
    if (selectedItem) {
      const path = selectedItem.metadata?.agentPath as string | undefined;
      return agents.find((a) => a.folderPath === path) ?? null;
    }
    return newMission.pendingAgent;
  }, [selectedItem, newMission.pendingAgent, agents]);
  const selectedSessionKey = mc.activeSessionKey;
  const selectedAgentPath = mc.activeAgentPath;

  const actions = useMcActions({ mc, activeAgent, paths });

  const agentPathForId = useCallback(
    (id: string) =>
      mc.items.find((i) => i.id === id)?.metadata?.agentPath as
        | string
        | undefined,
    [mc.items],
  );
  const selection = useCrossAgentSelection({
    paths,
    agentPathForId,
  });

  const toolbar = (
    <McToolbarSlot
      items={agentFilteredItems}
      filterUserId={filterUserId}
      search={missionSearch.query}
      isSearchingText={missionSearch.isSearchingText}
      onFilterUserIdChange={setFilterUserId}
      onSearchChange={missionSearch.setQuery}
      modeToggle={modeToggle}
      newMission={{
        agents: newMission.newMissionAgents,
        menuOpen: newMission.menuOpen,
        onMenuOpenChange: newMission.requestNewMission,
        onPick: newMission.pickNewMissionAgent,
      }}
      collapsed={missionPanelOpen}
    />
  );

  return {
    items: missionSearch.items,
    allItems: personFilteredItems,
    feedItems: mc.feedItems,
    loading: mc.loading,
    isLoaded: mc.isLoaded,
    selectedId: mc.selectedId,
    setSelectedId: mc.setSelectedId,
    highlightedId,
    setHighlightedId,
    activeAgent,
    draftScope: missionControlDraftScope(scope?.teamId),
    selectedSessionKey,
    selectedAgentPath,
    onSelectSession: mc.setSelectedId,
    sessionKeyFor: actions.sessionKeyFor,
    onDelete: mc.handleDelete,
    onApprove: mc.handleApprove,
    onArchive: mc.handleArchive,
    onRename: mc.handleRename,
    loadHistory: mc.loadHistory,
    onLoadOlderMessages: mc.onLoadOlderMessages,
    hasOlderMessages: mc.hasOlderMessages,
    sendMessageNow: actions.sendMessageNow,
    createConversation: actions.createConversation,
    stopSession: actions.stopSession,
    onItemMove: actions.handleItemMove,
    canDropItem: actions.canDropItem,
    selection,
    registerOpener: newMission.registerOpener,
    openerReady: newMission.openerReady,
    openNewMission: newMission.openNewMission,
    onAutoOpenEmpty: newMission.onAutoOpenEmpty,
    autoOpenKey: `${filterPath || "all"}:${filterUserId ?? "everyone"}`,
    autoOpenItemCount: personFilteredItems.length,
    autoOpenBlocked: newMission.agentPickerOpen || firstDay.holdsAutoOpen,
    search: {
      query: missionSearch.query,
      setQuery: missionSearch.setQuery,
      isSearchingText: missionSearch.isSearchingText,
    },
    hasSearchQuery: missionSearch.hasQuery,
    emptyState: missionSearch.hasQuery
      ? missionSearch.emptyState
      : gettingReady,
    panelAgentName: activeAgent?.name ?? selectedItem?.subtitle,
    selectedRunning: selectedItem?.status === "running",
    firstDay: firstDay.placement,
    toolbar,
    dialogs: newMission.dialogs,
  };
}
