import { AIBoard } from "@houston-ai/board";
import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useOrgWriteLock } from "../../hooks/use-org-write-lock";
import { perfSpans } from "../../lib/perf-spans";
import { useUIStore } from "../../stores/ui";
import { FirstDayLead } from "../first-day/first-day-banner";
import { FirstDayHero } from "../first-day/first-day-cta";
import {
  buildMissionBoardColumns,
  MISSION_APPROVE_STATUSES,
  MISSION_ARCHIVE_STATUSES,
} from "../mission-board-columns";
import { useIsActiveView } from "../shell/keep-alive-views";
import { useShellDetailPanel } from "../shell/use-shell-detail-panel";
import type { BoardSource } from "./board-source";
import { PanelBackToBoard, PanelWidthToggle } from "./panel-width-controls";
import { useBoardChatWiring } from "./use-board-chat-wiring";
import { useBoardKeyboard } from "./use-board-keyboard";
import { useBoardSelectionUI } from "./use-board-selection-ui";

export function MissionBoard({ source }: { source: BoardSource }) {
  const { t } = useTranslation(["dashboard", "board"]);
  const { panelContainer, setPanelOpen } = useShellDetailPanel({ wide: true });
  const chatWide = useUIStore((s) => s.chatWide || s.filePreview !== null);
  const isActive = useIsActiveView();
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);

  const wiring = useBoardChatWiring(source);
  const { locked } = useOrgWriteLock();

  const baseColumns = useMemo(
    () =>
      buildMissionBoardColumns(
        {
          running: t("dashboard:columns.running"),
          needsYou: t("dashboard:columns.needsYou"),
          done: t("dashboard:columns.done"),
          newMission: t("dashboard:empty.newMission"),
        },
        locked ? null : source.openNewMission,
      ),
    [t, source.openNewMission, locked],
  );
  const closeOpenChat = useCallback(
    () => source.setSelectedId(null),
    [source.setSelectedId],
  );
  const { columns, selectionProps } = useBoardSelectionUI({
    baseColumns,
    allItems: source.allItems,
    selection: source.selection,
    openChatId: source.selectedId,
    onCloseOpenChat: closeOpenChat,
  });

  const closerRef = useRef<(() => void) | null>(null);
  const { handleCloserReady } = useBoardKeyboard({
    isActive,
    items: source.items,
    columns,
    selectedId: source.selectedId,
    setSelectedId: source.setSelectedId,
    highlightedId: source.highlightedId,
    setHighlightedId: source.setHighlightedId,
    missionPanelOpen,
    setPanelOpen,
    isLoaded: source.isLoaded,
    hasSearchQuery: source.hasSearchQuery,
    openerReady: source.openerReady,
    autoOpenKey: source.autoOpenKey,
    autoOpenItemCount: source.autoOpenItemCount,
    autoOpenBlocked: source.autoOpenBlocked,
    onAutoOpenEmpty: source.onAutoOpenEmpty,
  });

  const handleCloserReadyWide = useCallback(
    (close: () => void) => {
      closerRef.current = close;
      handleCloserReady(close);
    },
    [handleCloserReady],
  );
  const backToBoard = useCallback(() => {
    closerRef.current?.();
    source.setSelectedId(null);
  }, [source.setSelectedId]);

  const handleSelect = useCallback(
    (id: string | null) => {
      if (id) perfSpans.cardClicked();
      source.setSelectedId(id);
    },
    [source.setSelectedId],
  );

  const firstDay = source.firstDay;
  return (
    <>
      {source.toolbar}
      <FirstDayLead placement={firstDay} />
      <div className="flex-1 min-h-0">
        <AIBoard
          items={source.items}
          columns={columns}
          selectedId={source.selectedId}
          highlightedId={source.highlightedId}
          onSelect={handleSelect}
          onDelete={source.onDelete}
          onApprove={source.onApprove}
          approveStatuses={MISSION_APPROVE_STATUSES}
          onArchive={source.onArchive}
          archiveStatuses={MISSION_ARCHIVE_STATUSES}
          onRename={source.onRename}
          onNewPanelOpenerReady={source.registerOpener}
          onPanelCloserReady={handleCloserReadyWide}
          hidePanelClose={chatWide}
          panelLeading={
            chatWide ? (
              <PanelBackToBoard
                label={t("board:panel.backToTasks")}
                onClick={backToBoard}
              />
            ) : undefined
          }
          panelTrailing={<PanelWidthToggle />}
          emptyState={
            firstDay.kind === "hero" ? (
              <FirstDayHero agent={firstDay.agent} />
            ) : (
              source.emptyState
            )
          }
          panelContainer={panelContainer}
          onPanelOpenChange={setPanelOpen}
          onItemMove={source.onItemMove}
          canDropItem={source.canDropItem}
          {...(selectionProps ?? {})}
          {...wiring.chatProps}
        />
      </div>
      {wiring.dialogs}
      {source.dialogs}
    </>
  );
}
