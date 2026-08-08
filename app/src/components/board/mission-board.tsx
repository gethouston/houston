import { AIBoard, type MessageMention } from "@houston-ai/board";
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOpenAgentHref } from "../../hooks/use-open-agent-file";
import { childMissionsOf, parentMissionOf } from "../../lib/child-missions";
import { perfSpans } from "../../lib/perf-spans";
import { modelAcceptsImages } from "../../lib/providers";
import { useUIStore } from "../../stores/ui";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";
import {
  buildMissionBoardColumns,
  MISSION_APPROVE_STATUSES,
  MISSION_ARCHIVE_STATUSES,
} from "../mission-board-columns";
import { AgentPanelAvatar } from "../shell/agent-panel-avatar";
import { useIsActiveView } from "../shell/keep-alive-views";
import { useShellDetailPanel } from "../shell/use-shell-detail-panel";
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { useQueuedMessageLabels } from "../use-queued-message-labels";
import type { BoardSource } from "./board-source";
import { useBoardDrafts } from "./use-board-drafts";
import { useBoardKeyboard } from "./use-board-keyboard";
import { useBoardLabels } from "./use-board-labels";
import { useBoardSelectionUI } from "./use-board-selection-ui";
import { useBoardSendQueue } from "./use-board-send-queue";

/**
 * The one board both views render. It owns every shared concern — columns,
 * the multi-select UI, the `useAgentChatPanel` integration, the message
 * queue, draft persistence, keyboard navigation, run-in-terminal actions, and
 * the full AIBoard prop spread — and pulls the divergent pieces (data, active
 * agent, new-mission flow, bulk routing, toolbar, dialogs) from `source`.
 */
export function MissionBoard({
  source,
  isActive: tabActive,
}: {
  source: BoardSource;
  /** When this board is one agent-detail TAB (the Activity tab), the tab's own
   *  active flag. Every agent tab stays mounted (only CSS-hidden), so without
   *  it the board keeps its selected mission and keeps portaling a detail panel
   *  into the shared shell panel while another tab (Routines) portals its own —
   *  two stacked panels, the chat "split in half" (HOU-1165). Composed with the
   *  screen-level active-view signal below. Omit for the top-level Mission
   *  Control board, which the screen signal governs alone. */
  isActive?: boolean;
}) {
  const { t } = useTranslation(["dashboard", "board"]);
  const { panelContainer, setPanelOpen } = useShellDetailPanel();
  // "Active" here means BOTH the enclosing screen is visible AND (when this is a
  // tab) the tab is the selected one. `useIsActiveView` is only tab-accurate for
  // top-level kept-alive screens, not agent tabs, so tab callers pass their own
  // flag; the top-level board passes none and rides the screen signal alone.
  const screenActive = useIsActiveView();
  const isActive = screenActive && (tabActive ?? true);
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);
  const addToast = useUIStore((s) => s.addToast);
  const queuedLabels = useQueuedMessageLabels();
  const { cardLabels, composerLabels } = useBoardLabels();
  const { drafts, onDraftChange } = useBoardDrafts(source.draftScope);

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
  useEffect(() => {
    if (!isActive) {
      source.setSelectedId(null);
      setPanelOpen(false);
    }
  }, [isActive, source.setSelectedId, setPanelOpen]);
  const { columns, selectionProps } = useBoardSelectionUI({
    baseColumns,
    allItems: source.allItems,
    selection: source.selection,
    openChatId: source.selectedId,
    onCloseOpenChat: closeOpenChat,
  });

  // Per-agent chat panel features (skills, model selector, tool/link
  // renderers) scoped to the active agent — already the shared source of
  // truth for both views.
  // The missions the OPEN chat started (PRODUCT-1244): read off the board's own
  // items, so they stay live through the same invalidation the cards use.
  const childMissions = useMemo(
    () =>
      childMissionsOf(source.allItems, source.selectedSessionKey, {
        running: t("dashboard:columns.running"),
        needsYou: t("dashboard:columns.needsYou"),
        done: t("dashboard:columns.done"),
      }),
    [source.allItems, source.selectedSessionKey, t],
  );
  // The inverse: when the OPEN chat is itself agent-started, the mission it
  // was started from — the "Go to main mission" bar's target.
  const parentMission = useMemo(
    () => parentMissionOf(source.allItems, source.selectedSessionKey),
    [source.allItems, source.selectedSessionKey],
  );
  const panel = useAgentChatPanel({
    agent: source.activeAgent,
    agentDef: source.activeAgentDef,
    selectedSessionKey: source.selectedSessionKey,
    onSelectSession: source.onSelectSession,
    draftScope: source.draftScope,
    childMissions,
    parentMission,
    // Opening a child (or the parent) is the board's ordinary selection: the
    // panel swaps to that mission's chat, exactly as clicking its card would.
    onOpenChildMission: source.setSelectedId,
  });
  const overrides = useMemo(
    () => ({
      providerOverride: panel.effectiveProvider,
      modelOverride: panel.effectiveModel,
      modeOverride: panel.turnMode,
    }),
    [panel.effectiveProvider, panel.effectiveModel, panel.turnMode],
  );

  const sendQueue = useBoardSendQueue({
    selectedSessionKey: source.selectedSessionKey,
    selectedAgentPath: source.selectedAgentPath,
    overrides,
    sendMessageNow: source.sendMessageNow,
  });

  const { handleCloserReady } = useBoardKeyboard({
    items: source.items,
    columns,
    selectedId: source.selectedId,
    setSelectedId: source.setSelectedId,
    highlightedId: source.highlightedId,
    setHighlightedId: source.setHighlightedId,
    missionPanelOpen,
    isLoaded: source.isLoaded,
    hasSearchQuery: source.hasSearchQuery,
    openerReady: source.openerReady,
    autoOpenKey: source.autoOpenKey,
    autoOpenItemCount: source.autoOpenItemCount,
    autoOpenBlocked: source.autoOpenBlocked,
    onAutoOpenEmpty: source.onAutoOpenEmpty,
  });

  const handleCreateConversation = useCallback(
    (text: string, files: File[], mentions?: MessageMention[]) =>
      source.createConversation({ text, files, ...overrides, mentions }),
    [source.createConversation, overrides],
  );
  const handleNotice = useCallback(
    (message: string) => addToast({ title: message }),
    [addToast],
  );
  const handleOpenLink = useOpenAgentHref(
    source.activeAgent?.folderPath ?? null,
  );

  const attachmentValidation = useAttachmentRejectionDialog({
    modelAcceptsImages: modelAcceptsImages(
      panel.effectiveProvider,
      panel.effectiveModel,
    ),
  });

  return (
    <>
      {source.toolbar}
      <div className="flex-1 min-h-0">
        <AIBoard
          items={source.items}
          columns={columns}
          selectedId={source.selectedId}
          highlightedId={source.highlightedId}
          onSelect={(id) => {
            // Card-open perf mark (HOU-1011): completed when the opened
            // conversation's messages paint (use-agent-board-data).
            if (id) perfSpans.cardClicked();
            source.setSelectedId(id);
          }}
          feedItems={source.feedItems}
          isLoading={source.loading}
          onDelete={source.onDelete}
          onApprove={source.onApprove}
          approveStatuses={MISSION_APPROVE_STATUSES}
          onArchive={source.onArchive}
          archiveStatuses={MISSION_ARCHIVE_STATUSES}
          onRename={source.onRename}
          onCreateConversation={handleCreateConversation}
          onSendMessage={sendQueue.handleSendMessage}
          sessionKeyFor={source.sessionKeyFor}
          queuedMessages={sendQueue.queuedMessages}
          onRemoveQueuedMessage={sendQueue.onRemoveQueuedMessage}
          queuedLabels={queuedLabels}
          onLoadHistory={source.loadHistory}
          onLoadOlderMessages={source.onLoadOlderMessages}
          hasOlderMessages={source.hasOlderMessages}
          onNewPanelOpenerReady={source.registerOpener}
          onPanelCloserReady={handleCloserReady}
          emptyState={source.emptyState}
          panelContainer={panelContainer}
          onPanelOpenChange={setPanelOpen}
          onStopSession={source.stopSession}
          drafts={drafts}
          onDraftChange={onDraftChange}
          onNotice={handleNotice}
          composerLabels={composerLabels}
          currentUserId={panel.currentUserId}
          authorLabels={panel.authorLabels}
          showSenders={panel.showSenders}
          agentLabel={panel.agentLabel}
          renderSenderAvatar={panel.renderSenderAvatar}
          senderNameClass={panel.senderNameClass}
          {...panel.mentionProps}
          dictation={panel.dictation}
          prepareAttachments={attachmentValidation.prepareAttachments}
          onAttachmentRejections={attachmentValidation.onAttachmentRejections}
          onOpenLink={handleOpenLink}
          cardAvatar={source.cardAvatar}
          thinkingIndicator={panel.thinkingIndicator}
          panelAgentName={source.panelAgentName}
          panelAvatar={
            <AgentPanelAvatar
              color={source.activeAgent?.color}
              running={source.selectedRunning}
            />
          }
          cardLabels={cardLabels}
          onItemMove={source.onItemMove}
          canDropItem={source.canDropItem}
          {...(selectionProps ?? {})}
          chatEmptyState={panel.chatEmptyState}
          composerHeader={panel.composerHeader}
          composerOverride={panel.composerOverride}
          composerOverrideMode={panel.composerOverrideMode}
          canSendEmpty={panel.canSendEmpty}
          onComposerSubmit={panel.onComposerSubmit}
          footer={panel.footer}
          attachMenu={panel.attachMenu}
          renderUserMessage={panel.renderUserMessage}
          onEditMessage={panel.onEditMessage}
          canEditMessage={panel.canEditMessage}
          editMessageLabel={panel.editMessageLabel}
          enableMessageCopy={panel.enableMessageCopy}
          canCopyMessage={panel.canCopyMessage}
          copyMessageLabel={panel.copyMessageLabel}
          messageEditing={panel.messageEditing}
          renderLink={panel.renderLink}
          renderSystemMessage={panel.renderSystemMessage}
          conversationMap={panel.conversationMap}
          mapFeedItems={panel.mapFeedItems}
          afterMessages={panel.afterMessages}
          isSpecialTool={panel.isSpecialTool}
          renderToolResult={panel.renderToolResult}
          processLabels={panel.processLabels}
          getThinkingMessage={panel.getThinkingMessage}
          renderTurnSummary={panel.renderTurnSummary}
        />
      </div>
      {panel.pickerDialog}
      {attachmentValidation.dialog}
      {source.dialogs}
    </>
  );
}
