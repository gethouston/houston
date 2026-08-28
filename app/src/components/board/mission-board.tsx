import { AIBoard } from "@houston-ai/board";
import { useIsMobile } from "@houston-ai/core";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { openMissionChatForPath } from "../../lib/mission-chat";
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
 * Below md a card tap is a STRUCTURAL fork: it pushes the mission-chat
 * screen (`lib/mission-chat.ts`) instead of selecting into the side panel —
 * chat is a place on the phone, not a panel.
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
          empty: {
            running: t("dashboard:pager.emptyRunning"),
            needsYou: t("dashboard:pager.emptyNeedsYou"),
            done: t("dashboard:pager.emptyDone"),
          },
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
      // The phone fork: a card tap pushes the first-class chat screen. A card
      // whose agent left the roster falls through to the panel selection.
      if (isMobile && id) {
        const item =
          source.items.find((i) => i.id === id) ??
          source.allItems.find((i) => i.id === id);
        const agentPath = item?.metadata?.agentPath as string | undefined;
        if (openMissionChatForPath(agentPath, id)) return;
      }
      source.setSelectedId(id);
    },
    [isMobile, source.items, source.allItems, source.setSelectedId],
  );

  return (
    <>
      {/* Desktop layer only: below md the mobile controls own this space. The
          wide strip form portals into the team strip and escapes the wrapper,
          which is exactly right — the strip itself is desktop chrome. The
          mobile controls MOUNT only below the breakpoint (a structural fork,
          like the card tap): their "All agents" / "Archived" texts would trip
          strict text lookups as hidden desktop DOM. */}
      {source.toolbar && (
        <div className="hidden md:contents">{source.toolbar}</div>
      )}
      {isMobile && source.mobileControls}
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
