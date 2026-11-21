import { AIBoard } from "@houston-ai/board";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";
import { ArchivedEmptyState } from "../agent/archived-empty-state";
import type { useShellDetailPanel } from "../shell/use-shell-detail-panel";
import type { useMissionSearch } from "../use-mission-search";
import { PanelBackToBoard, PanelWidthToggle } from "./panel-width-controls";
import { useArchivedChatProps } from "./use-archived-chat-props";
import type { useMissionControlArchived } from "./use-mission-control-archived";
import type { useMissionControlArchivedPanel } from "./use-mission-control-archived-panel";

type ArchivedData = ReturnType<typeof useMissionControlArchived>;
type ArchivedPanel = ReturnType<typeof useMissionControlArchivedPanel>;
type MissionSearch = ReturnType<typeof useMissionSearch>;
type ShellDetailPanel = ReturnType<typeof useShellDetailPanel>;

export function ArchivedMissionBoard({
  data,
  missionSearch,
  archivedPanel,
  panelContainer,
  setPanelOpen,
}: {
  data: ArchivedData;
  missionSearch: MissionSearch;
  archivedPanel: ArchivedPanel;
  panelContainer: ShellDetailPanel["panelContainer"];
  setPanelOpen: ShellDetailPanel["setPanelOpen"];
}) {
  const { t } = useTranslation("board");
  const chatWide = useUIStore((s) => s.chatWide || s.filePreview !== null);
  const { chatProps, dialogs } = useArchivedChatProps(data, archivedPanel);

  return (
    <>
      <div className="flex-1 min-h-0">
        <AIBoard
          layout="list"
          listAlign="left"
          items={missionSearch.items}
          searchSnippets={missionSearch.snippets}
          selectedId={data.selectedId}
          onSelect={data.setSelectedId}
          panelContainer={panelContainer}
          emptyState={
            <ArchivedEmptyState
              hasQuery={missionSearch.hasQuery}
              isSearchingText={missionSearch.isSearchingText}
            />
          }
          onPanelOpenChange={setPanelOpen}
          hidePanelClose={chatWide}
          panelLeading={
            chatWide ? (
              <PanelBackToBoard
                label={t("panel.backToArchived")}
                onClick={() => data.setSelectedId(null)}
              />
            ) : undefined
          }
          panelTrailing={<PanelWidthToggle />}
          {...chatProps}
        />
      </div>
      {dialogs}
    </>
  );
}
