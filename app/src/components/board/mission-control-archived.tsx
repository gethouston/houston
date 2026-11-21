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
  agents: Agent[];
  onShowActive: () => void;
  scope?: MissionControlScope;
  agentFilter?: ReactNode;
  scopedAgents: Agent[];
  newMissionMenuOpen: boolean;
  onNewMissionMenuChange: (open: boolean) => void;
  onNewMission: (agent: Agent) => void;
}) {
  const { t } = useTranslation("board");
  const { t: tTeams } = useTranslation("teams");
  const { panelContainer, setPanelOpen } = useShellDetailPanel({ wide: true });
  const addToast = useUIStore((s) => s.addToast);
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);

  const data = useMissionControlArchived(agents);

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

  const { agentFilteredItems } = useMcScope(agents, data.items, scope);
  const [search, setSearch] = useState("");

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
