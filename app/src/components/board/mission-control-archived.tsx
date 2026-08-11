import { Button } from "@houston-ai/core";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pendingMissionSurface } from "../../lib/board-surface-nav";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { MissionControlToolbar } from "../mission-control-toolbar";
import { useIsActiveView } from "../shell/keep-alive-views";
import { PageHeaderTools } from "../shell/page-header/page-header-tools";
import { useShellDetailPanel } from "../shell/use-shell-detail-panel";
import { useMissionSearch } from "../use-mission-search";
import { ArchivedMissionBoard } from "./archived-mission-board";
import { type MissionControlScope, useMcScope } from "./use-mc-scope.ts";
import { useMissionControlArchived } from "./use-mission-control-archived";
import { useMissionControlArchivedPanel } from "./use-mission-control-archived-panel";
import { usePendingMissionTarget } from "./use-pending-mission-target";

/**
 * Cross-agent Archived view for Mission Control: a column-less list of every
 * archived mission; clicking one opens its chat; sending re-activates it and
 * hands the user back to this screen's active board, with the mission's chat
 * open, to keep the conversation in view.
 *
 * `agents` is ALWAYS the full workspace roster, whoever is rendering: the sweep
 * behind it (`useMissionControlArchived`) keys the one shared
 * `all-conversations` query on it. A team's archive narrows what it RENDERS
 * through `scope` instead (the one-sweep rule, `useTeamBoardScope`).
 *
 * It says nothing about WHERE it is: the archive is a MODE of Tasks, entered
 * from the active board's "Archived" button and left by the "Back to tasks"
 * button this screen's own toolbar carries, so a title, a qualifier or a trail
 * crumb here would be the third thing on one screen saying the same word.
 */
export function MissionControlArchived({
  agents,
  onShowActive,
  scope,
  agentFilter,
  scopedAgents,
  newMissionMenuOpen,
  onNewMissionMenuChange,
  onNewMission,
}: {
  /** The FULL workspace roster, always. Never a team's slice. */
  agents: Agent[];
  onShowActive: () => void;
  /** Narrows what this archive renders. Every live caller is a team, so it is
   *  always passed; omitting it archives the whole roster. */
  scope?: MissionControlScope;
  /** The section's own agent filter capsule, rendered in the tools row. */
  agentFilter?: ReactNode;
  /** The team's agents — the "New task" menu's roster. */
  scopedAgents: Agent[];
  newMissionMenuOpen: boolean;
  onNewMissionMenuChange: (open: boolean) => void;
  onNewMission: (agent: Agent) => void;
}) {
  const { t } = useTranslation("board");
  const { t: tTeams } = useTranslation("teams");
  const { panelContainer, setPanelOpen } = useShellDetailPanel();
  const addToast = useUIStore((s) => s.addToast);
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);

  const data = useMissionControlArchived(agents);

  // An @mention (or a notification) can name a mission that was archived long
  // ago, and the archive is the only surface that can open it. It claims those
  // targets and only those: an ACTIVE mission's id stays published for the
  // board this archive belongs to, which the owner's router swaps back in.
  const pendingId = useUIStore((s) => s.activityPanelId);
  const pendingSurface = pendingMissionSurface(
    data.rawConversations,
    pendingId,
  );
  usePendingMissionTarget({
    surface: "archived",
    pendingSurface,
    selectedId: data.selectedId,
    setSelectedId: data.setSelectedId,
    missionPanelOpen,
  });

  // Only the NARROWING is this surface's business now: the scope picker moved
  // to the team strip's breadcrumb, which owns the pin both surfaces read.
  const { agentFilteredItems } = useMcScope(agents, data.items, scope);
  const [search, setSearch] = useState("");

  // HOU-1165: there is ONE shell detail panel, shared by every kept-alive
  // screen. `MissionBoard` releases it when its screen hides, but the archive
  // is not a `MissionBoard` -- without its own release, a team archive left
  // with a mission open keeps portaling its chat into that panel after the
  // user navigates away.
  const isActive = useIsActiveView();
  useEffect(() => {
    if (isActive) return;
    data.setSelectedId(null);
    setPanelOpen(false);
  }, [isActive, data.setSelectedId, setPanelOpen]);

  const handleSearchError = useCallback(() => {
    addToast({
      title: t("search.historyErrorTitle"),
      description: t("search.historyErrorDescription"),
      variant: "error",
    });
  }, [addToast, t]);
  const missionSearch = useMissionSearch({
    items: agentFilteredItems,
    query: search,
    loadHistory: data.loadHistory,
    onHistoryLoadError: handleSearchError,
  });

  const archivedPanel = useMissionControlArchivedPanel(data, onShowActive);

  return (
    <>
      <PageHeaderTools>
        {(oneRow) => (
          <MissionControlToolbar
            variant={oneRow ? "strip" : "row"}
            search={search}
            isSearchingText={missionSearch.isSearchingText}
            onSearchChange={setSearch}
            // Search, filter, primary action — the SAME left-to-right order the
            // active board's tools take. The archive's filter is by agent
            // rather than by person, but it sits in the same slot.
            agentFilter={agentFilter}
            modeToggle={
              <Button variant="secondary" size="sm" onClick={onShowActive}>
                {tTeams("teamView.archive.back")}
              </Button>
            }
            newMission={{
              agents: scopedAgents,
              menuOpen: newMissionMenuOpen,
              onMenuOpenChange: onNewMissionMenuChange,
              onPick: onNewMission,
            }}
            collapsed={missionPanelOpen}
          />
        )}
      </PageHeaderTools>
      <ArchivedMissionBoard
        data={data}
        missionSearch={missionSearch}
        archivedPanel={archivedPanel}
        panelContainer={panelContainer}
        setPanelOpen={setPanelOpen}
      />
    </>
  );
}
