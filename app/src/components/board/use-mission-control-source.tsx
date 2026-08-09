import { useCallback, useMemo, useState } from "react";
import { pendingMissionSurface } from "../../lib/board-surface-nav";
import { missionMatchesPerson } from "../../lib/mission-people";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { MissionControlToolbar } from "../mission-control-toolbar";
import { PageHeaderTools } from "../shell/page-header/page-header-tools";
import { useMissionControl } from "../use-mission-control";
import type { BoardSource } from "./board-source";
import {
  filteredScopeAgent,
  missionControlDraftScope,
} from "./mission-control-scope.ts";
import { useCrossAgentSelection } from "./use-cross-agent-selection";
import { useMcActions } from "./use-mc-actions";
import { useMcNewMission } from "./use-mc-new-mission";
import { type MissionControlScope, useMcScope } from "./use-mc-scope.ts";
import { useMcSearch } from "./use-mc-search.tsx";
import { usePendingMissionTarget } from "./use-pending-mission-target";

/**
 * Builds the {@link BoardSource} for cross-agent Mission Control: every
 * agent's missions on one board, a "which agent?" picker before a new
 * mission, a search + person filter toolbar, and bulk actions routed per
 * agent. The active agent that scopes the right panel is whichever the
 * selected card belongs to, or the one just picked for a new mission.
 *
 * `scope` narrows all of that to one team's agents and lets the caller own the
 * agent filter (see {@link MissionControlScope}). The cross-agent sweep always
 * spans the agents it is handed, so a team board passes the FULL roster and
 * scopes what it renders — one shared query, no per-team re-sweep.
 */
export function useMissionControlSource(
  agents: Agent[],
  scope?: MissionControlScope,
): BoardSource {
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);

  const mc = useMissionControl(agents);

  // Every "open this mission" navigation lands on ONE of the board's two
  // surfaces (notification, @mention row, palette, archived handoff). This is
  // the ACTIVE one, so it claims only the targets the raw sweep rows say are
  // active — an archived mission's id is left published for the archive, which
  // the owner's surface router is about to swap in.
  const pendingId = useUIStore((s) => s.activityPanelId);
  const pendingSurface = pendingMissionSurface(mc.rawConversations, pendingId);
  usePendingMissionTarget({
    surface: "active",
    pendingSurface,
    selectedId: mc.selectedId,
    setSelectedId: mc.setSelectedId,
    missionPanelOpen,
  });

  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(
    mc.selectedId,
  );

  // No `setFilterPath` any more: the scope is a breadcrumb in row 1 of the
  // team strip, which reads and writes the same `teamAgentFilter` pin
  // directly. `filterPath` is still READ, for the auto-open key. The scope's
  // `onFilterPathChange` still has to exist, because its presence is what
  // makes `filterPath` CONTROLLED rather than local to this hook.
  const { scopedAgents, paths, agentFilteredItems, visibleAgents, filterPath } =
    useMcScope(agents, mc.items, scope);

  // Person filter runs AFTER the agent filter, BEFORE text search: narrow to the
  // missions the chosen person is on. `null` (Everyone) is a no-op. The filter
  // menu's roster stays keyed off `agentFilteredItems` so every person is always
  // reselectable regardless of the active person filter.
  const personFilteredItems = useMemo(
    () =>
      filterUserId
        ? agentFilteredItems.filter((i) =>
            missionMatchesPerson(i.people, filterUserId),
          )
        : agentFilteredItems,
    [agentFilteredItems, filterUserId],
  );

  // The agent the board is NARROWED to, if any: "New task" on a pinned board
  // must not ask a question the board already answered.
  const pinnedAgent = filteredScopeAgent(scopedAgents, filterPath);
  const newMission = useMcNewMission({
    agents: scopedAgents,
    visibleAgents,
    scopedAgents,
    pinnedAgent,
    selectedId: mc.selectedId,
    setSelectedId: mc.setSelectedId,
  });
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
  // Straight from the data hook, so the chat panel and the feed always name
  // the same conversation — including the beat after a create, before the
  // cross-agent sweep has returned the new mission's row.
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
    // One row or two is the STRIP's call, not this hook's: it is the only
    // thing that knows how much room the three zones actually have.
    <PageHeaderTools>
      {(oneRow) => (
        <MissionControlToolbar
          variant={oneRow ? "strip" : "row"}
          items={agentFilteredItems}
          filterUserId={filterUserId}
          search={missionSearch.query}
          isSearchingText={missionSearch.isSearchingText}
          onFilterUserIdChange={setFilterUserId}
          onSearchChange={missionSearch.setQuery}
          newMission={{
            agents: newMission.newMissionAgents,
            menuOpen: newMission.menuOpen,
            onMenuOpenChange: newMission.requestNewMission,
            onPick: newMission.pickNewMissionAgent,
          }}
          collapsed={missionPanelOpen}
        />
      )}
    </PageHeaderTools>
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
    autoOpenBlocked: newMission.agentPickerOpen,
    hasSearchQuery: missionSearch.hasQuery,
    emptyState: missionSearch.emptyState,
    panelAgentName: activeAgent?.name ?? selectedItem?.subtitle,
    selectedRunning: selectedItem?.status === "running",
    toolbar,
    dialogs: newMission.dialogs,
  };
}
