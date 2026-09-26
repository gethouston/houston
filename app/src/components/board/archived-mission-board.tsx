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

/**
 * The RENDERING half of the cross-agent Archived view: the column-less list of
 * archived missions, the selected mission's chat portaled into the shared shell
 * panel, and the two dialogs that chat can raise.
 *
 * Its own file because everything above it in `mission-control-archived.tsx` is
 * WIRING — the sweep, the scope, the search box, the pending-target routing,
 * the release-on-hide. The chat half of its props is
 * {@link useArchivedChatProps}, shared with the phone's pushed chat. It takes
 * the wiring's hooks whole, typed off their return types, so the seam can
 * never drift from what those hooks actually return.
 *
 * It owns no state: every decision is made above and read straight off `data`,
 * `missionSearch` and `archivedPanel`.
 */
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
  const chatWide = useUIStore((s) => s.chatWide);
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
          // Wide: the list is out of the layout, so the header leads with the
          // way back to it and drops the X, as the board's does. No closer to
          // run here: the archive has no new-task composer, so clearing the
          // selection is the whole close.
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
