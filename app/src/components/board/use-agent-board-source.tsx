import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolvePendingActivitySelection } from "../../lib/notification-nav";
import type { Agent, AgentDefinition } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { MissionBoardEmptyState } from "../mission-board-empty-state";
import { AgentCardAvatar } from "../shell/agent-card-avatar";
import { useMissionSearch } from "../use-mission-search";
import type { BoardSource } from "./board-source";
import { useAgentBoardData } from "./use-agent-board-data";
import { useAgentBoardScope } from "./use-agent-board-scope";
import { useAgentBoardSelection } from "./use-agent-board-selection";
import { useAgentBoardSend } from "./use-agent-board-send";
import { useAgentNewMission } from "./use-agent-new-mission";

/**
 * Builds the {@link BoardSource} for a single agent's board tab: per-agent
 * data + send, multi-select, the default-mode "New mission" flow, and the
 * cross-agent navigation handoff (a notification / command-palette / Mission
 * Control click publishes its target via `activityPanelId`, which this reused
 * tab reconciles on agent switch).
 */
export function useAgentBoardSource(
  agent: Agent,
  agentDef: AgentDefinition,
): BoardSource {
  const { t } = useTranslation(["board", "dashboard"]);
  const path = agent.folderPath;

  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);
  const missionSearchQuery = useUIStore(
    (s) => s.agentMissionSearchQueries[path] ?? "",
  );
  const setAgentMissionSearchQuery = useUIStore(
    (s) => s.setAgentMissionSearchQuery,
  );
  const setAgentMissionSearchLoading = useUIStore(
    (s) => s.setAgentMissionSearchLoading,
  );
  const addToast = useUIStore((s) => s.addToast);

  const pendingId = useUIStore((s) => s.activityPanelId);
  const pendingForceOpen = useUIStore((s) => s.activityPanelForceOpen);
  const clearPending = useUIStore((s) => s.setActivityPanelId);

  const [selectedId, setSelectedId] = useState<string | null>(pendingId);
  const [highlightedId, setHighlightedId] = useState<string | null>(pendingId);

  // `selectedId`/`highlightedId` are per-agent, but this tab is reused across
  // agents. On switch, adopt the published cross-agent target (if any) during
  // render — `missionPanelOpen` still describes the agent we left, so deferring
  // to the consume effect below would strand the nav.
  const [trackedAgentId, setTrackedAgentId] = useState(agent.id);
  if (trackedAgentId !== agent.id) {
    setTrackedAgentId(agent.id);
    const next = resolvePendingActivitySelection({
      pendingActivityId: pendingId,
      forceOpen: pendingForceOpen,
      agentSwitched: true,
      selectedId,
      missionPanelOpen,
    });
    setSelectedId(next);
    setHighlightedId(next);
  }

  useEffect(() => {
    if (!pendingId) return;
    // Same-agent nav (the switch case is handled above): honor the guard so we
    // don't yank the user out of an open conversation or a New Mission composer.
    const next = resolvePendingActivitySelection({
      pendingActivityId: pendingId,
      forceOpen: pendingForceOpen,
      agentSwitched: false,
      selectedId,
      missionPanelOpen,
    });
    if (next) setSelectedId(next);
    clearPending(null);
  }, [pendingId, pendingForceOpen, clearPending, selectedId, missionPanelOpen]);

  const newMission = useAgentNewMission({ agentDef, selectedId });
  const data = useAgentBoardData({
    agent,
    agentDef,
    selectedId,
    setSelectedId,
  });
  const send = useAgentBoardSend({
    agent,
    agentDef,
    rawItems: data.rawItems,
    pendingAgentMode: newMission.pendingAgentMode,
    setPendingAgentMode: newMission.setPendingAgentMode,
  });
  const selection = useAgentBoardSelection(path, agent.id);

  // Attribution + person-scope narrowing (hosted Teams only; off-multiplayer
  // identity pass-through), on the active cards BEFORE text search, as the cross
  // board. The scope is chosen in the agent header (AgentPersonScopeMenu) and
  // read here through the shared per-agent scope context.
  const personFilteredItems = useAgentBoardScope({ path, items: data.items });

  const selectedSessionKey = useMemo(() => {
    if (!selectedId) return null;
    const item = (data.rawItems ?? []).find((a) => a.id === selectedId);
    return item?.session_key ?? `activity-${selectedId}`;
  }, [selectedId, data.rawItems]);

  const handleMissionSearchError = useCallback(() => {
    addToast({
      title: t("board:search.historyErrorTitle"),
      description: t("board:search.historyErrorDescription"),
      variant: "error",
    });
  }, [addToast, t]);
  const missionSearch = useMissionSearch({
    items: personFilteredItems,
    query: missionSearchQuery,
    loadHistory: data.loadHistory,
    onHistoryLoadError: handleMissionSearchError,
  });
  useEffect(() => {
    setAgentMissionSearchLoading(path, missionSearch.isSearchingText);
    return () => setAgentMissionSearchLoading(path, false);
  }, [missionSearch.isSearchingText, path, setAgentMissionSearchLoading]);

  const emptyState = missionSearch.hasQuery ? (
    <MissionBoardEmptyState
      isSearch={missionSearch.hasQuery}
      isSearchingText={missionSearch.isSearchingText}
      labels={{
        emptyTitle: t("board:empty.title"),
        emptyDescription: t("board:empty.description"),
        newMission: t("board:empty.newMission"),
        searchEmptyTitle: t("board:search.emptyTitle"),
        searchEmptyDescription: t("board:search.emptyDescription"),
        searchSearchingTitle: t("board:search.searchingTitle"),
        searchSearchingDescription: t("board:search.searchingDescription"),
        clearSearch: t("board:search.clearCta"),
      }}
      onNewMission={newMission.openDefaultMission}
      onClearSearch={() => setAgentMissionSearchQuery(path, "")}
    />
  ) : undefined;

  const cardAvatar = useMemo(
    () => <AgentCardAvatar color={agent.color} />,
    [agent.color],
  );

  return {
    variant: "agent",
    items: missionSearch.items,
    // Bulk section actions (archive-all / select-all) act within the current
    // person filter, matching the cross-agent board.
    allItems: personFilteredItems,
    feedItems: data.feedItems,
    loading: send.effectiveLoading,
    isLoaded: data.rawItems !== undefined,
    selectedId,
    setSelectedId,
    highlightedId,
    setHighlightedId,
    activeAgent: agent,
    activeAgentDef: agentDef,
    draftScope: agent.id,
    selectedSessionKey,
    selectedAgentPath: path,
    onSelectSession: setSelectedId,
    sessionKeyFor: data.sessionKeyFor,
    onDelete: data.handleDelete,
    onApprove: data.handleApprove,
    onRename: data.onRename,
    loadHistory: data.loadHistory,
    onLoadOlderMessages: data.onLoadOlderMessages,
    hasOlderMessages: data.hasOlderMessages,
    sendMessageNow: send.sendMessageNow,
    createConversation: send.createConversation,
    stopSession: send.stopSession,
    onItemMove: data.handleItemMove,
    canDropItem: data.canDropItem,
    selection,
    registerOpener: newMission.registerOpener,
    openerReady: newMission.openerReady,
    openNewMission: newMission.openDefaultMission,
    onAutoOpenEmpty: newMission.onAutoOpenEmpty,
    autoOpenKey: path,
    autoOpenItemCount: data.rawItems?.length ?? 0,
    autoOpenBlocked: selectedId != null,
    hasSearchQuery: missionSearch.hasQuery,
    emptyState,
    panelAgentName: agent.name,
    selectedRunning: (data.rawItems ?? []).some(
      (a) => a.id === selectedId && a.status === "running",
    ),
    cardAvatar,
  };
}
