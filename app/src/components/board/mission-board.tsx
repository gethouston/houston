import { AIBoard, type MessageMention } from "@houston-ai/board";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOpenAgentHref } from "../../hooks/use-open-agent-file";
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
import { panelTaskLabel } from "./panel-task-label";
import { useBoardDrafts } from "./use-board-drafts";
import { useBoardKeyboard } from "./use-board-keyboard";
import { useBoardLabels } from "./use-board-labels";
import { useBoardSelectionUI } from "./use-board-selection-ui";
import { useBoardSendQueue } from "./use-board-send-queue";

/**
 * The one board every mission surface renders (Mission Control and each team
 * board, which is the same source narrowed by a scope). It owns every shared
 * concern — columns,
 * the multi-select UI, the `useAgentChatPanel` integration, the message
 * queue, draft persistence, keyboard navigation, run-in-terminal actions, and
 * the full AIBoard prop spread — and pulls the divergent pieces (data, active
 * agent, new-mission flow, bulk routing, toolbar, dialogs) from `source`.
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
  // The panel's own task line, composed here rather than left to `ui/`'s
  // i18n-agnostic English fallback (`panelTaskLabel`).
  const panelLabel = useMemo(
    () =>
      panelTaskLabel(
        {
          task: (title) => t("board:panel.taskLabel", { title }),
          newTask: t("board:panel.newTask"),
        },
        source.selectedId,
        source.allItems.find((item) => item.id === source.selectedId)?.title,
      ),
    [t, source.selectedId, source.allItems],
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

  // Per-agent chat panel features (skills, model selector, tool/link
  // renderers) scoped to the active agent — already the shared source of
  // truth for both views.
  const panel = useAgentChatPanel({
    agent: source.activeAgent,
    selectedSessionKey: source.selectedSessionKey,
    onSelectSession: source.onSelectSession,
    draftScope: source.draftScope,
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
          thinkingIndicator={panel.thinkingIndicator}
          panelAgentName={source.panelAgentName}
          panelMissionLabel={panelLabel}
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
