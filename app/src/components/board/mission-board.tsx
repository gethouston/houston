import { AIBoard } from "@houston-ai/board";
import { useIsMobile } from "@houston-ai/core";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { perfSpans } from "../../lib/perf-spans";
import { useUIStore } from "../../stores/ui";
import {
  buildMissionBoardColumns,
  MISSION_APPROVE_STATUSES,
  MISSION_ARCHIVE_STATUSES,
} from "../mission-board-columns";
import { useIsActiveView } from "../shell/keep-alive-views";
import { useShellDetailPanel } from "../shell/use-shell-detail-panel";
import type { BoardSource } from "./board-source";
import { TeamTaskList } from "./team-task-list";
import { useBoardChatWiring } from "./use-board-chat-wiring";
import { useBoardKeyboard } from "./use-board-keyboard";
import { useBoardSelectionUI } from "./use-board-selection-ui";

/**
 * The one board every mission surface renders (Mission Control and each team
 * board, which is the same source narrowed by a scope). It owns the
 * board-shaped concerns — columns, the multi-select UI, keyboard navigation,
 * the shell panel portal, and the AIBoard prop spread — and pulls the chat
 * half from the shared {@link useBoardChatWiring} (the same wiring the
 * phone's pushed mission-chat screen binds) and the divergent pieces (data,
 * active agent, new-mission flow, bulk routing, toolbar, dialogs) from
 * `source`.
 *
 * Below md the kanban is not rendered at all: a phone gets
 * {@link TeamTaskList}, one scrolling list of the same missions grouped by
 * the same sections. A STRUCTURAL fork, not a narrower board — the desktop
 * board's columns, drag-and-drop, multi-select and side panel have no phone
 * form, and a card tap there is a pushed chat screen rather than a selection.
 * The dialogs stay mounted on both, because the flows behind them (the agent
 * picker, attachment rejections) belong to the source, not to the layout.
 */
export function MissionBoard({ source }: { source: BoardSource }) {
  const { t } = useTranslation(["dashboard", "board"]);
  const { panelContainer, setPanelOpen } = useShellDetailPanel();
  // Every board is the whole of a kept-alive top-level screen, so the
  // screen-level signal alone says whether this one is on the glass. It gates
  // the keyboard nav and the shell detail panel: a hidden-but-mounted screen
  // must stop portaling its panel, or two screens stack their panels into the
  // one shared slot and the chat renders "split in half" (HOU-1165).
  const isActive = useIsActiveView();
  const isMobile = useIsMobile();
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);

  const wiring = useBoardChatWiring(source);

  // Columns: base layout (single source of truth for status→section) plus the
  // Done "archive all" / Needs-you "select all" header actions when the source
  // supports multi-select.
  const baseColumns = useMemo(
    () =>
      buildMissionBoardColumns(
        {
          running: t("dashboard:columns.running"),
          needsYou: t("dashboard:columns.needsYou"),
          done: t("dashboard:columns.done"),
          newMission: t("dashboard:empty.newMission"),
        },
        source.openNewMission,
      ),
    [t, source.openNewMission],
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

  const handleSelect = useCallback(
    (id: string | null) => {
      // Card-open perf mark (HOU-1011): completed when the opened
      // conversation's messages paint (use-agent-board-data).
      if (id) perfSpans.cardClicked();
      source.setSelectedId(id);
    },
    [source.setSelectedId],
  );

  if (isMobile) {
    return (
      <>
        <TeamTaskList source={source} />
        {wiring.dialogs}
        {source.dialogs}
      </>
    );
  }

  return (
    <>
      {source.toolbar}
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
          onPanelCloserReady={handleCloserReady}
          emptyState={source.emptyState}
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
