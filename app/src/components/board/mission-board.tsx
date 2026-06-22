import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AIBoard } from "@houston-ai/board";

import { useUIStore } from "../../stores/ui";
import { openAgentHref } from "../../lib/open-href";
import { buildMissionBoardColumns } from "../mission-board-columns";
import { useDetailPanelContainer } from "../shell/detail-panel-context";
import { AgentPanelAvatar } from "../shell/agent-panel-avatar";
import { useQueuedMessageLabels } from "../use-queued-message-labels";
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";
import { useBoardSelectionUI } from "./use-board-selection-ui";
import { useBoardSendQueue } from "./use-board-send-queue";
import { useBoardKeyboard } from "./use-board-keyboard";
import { useBoardDrafts } from "./use-board-drafts";
import { useBoardLabels } from "./use-board-labels";
import type { BoardSource } from "./board-source";

/**
 * The one board both views render. It owns every shared concern — columns,
 * the multi-select UI, the `useAgentChatPanel` integration, the message
 * queue, draft persistence, keyboard navigation, run-in-terminal actions, and
 * the full AIBoard prop spread — and pulls the divergent pieces (data, active
 * agent, new-mission flow, bulk routing, toolbar, dialogs) from `source`.
 */
export function MissionBoard({ source }: { source: BoardSource }) {
  const { t } = useTranslation(["dashboard", "board"]);
  const panelContainer = useDetailPanelContainer();
  const setMissionPanelOpen = useUIStore((s) => s.setMissionPanelOpen);
  const missionPanelOpen = useUIStore((s) => s.missionPanelOpen);
  const addToast = useUIStore((s) => s.addToast);
  const queuedLabels = useQueuedMessageLabels();
  const { cardLabels, composerLabels } = useBoardLabels();
  const { drafts, onDraftChange } = useBoardDrafts();

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
  const { columns, selectionProps } = useBoardSelectionUI({
    baseColumns,
    allItems: source.allItems,
    selection: source.selection,
  });

  // Per-agent chat panel features (skills, model selector, tool/link
  // renderers) scoped to the active agent — already the shared source of
  // truth for both views.
  const panel = useAgentChatPanel({
    agent: source.activeAgent,
    agentDef: source.activeAgentDef,
    selectedSessionKey: source.selectedSessionKey,
    onSelectSession: source.onSelectSession,
  });
  const overrides = useMemo(
    () => ({
      providerOverride: panel.effectiveProvider,
      modelOverride: panel.effectiveModel,
    }),
    [panel.effectiveProvider, panel.effectiveModel],
  );

  const sendQueue = useBoardSendQueue({
    selectedSessionKey: source.selectedSessionKey,
    selectedAgentPath: source.selectedAgentPath,
    selectedSessionActive: source.selectedSessionActive,
    overrides,
    sendMessageNow: source.sendMessageNow,
    panelComposerSubmit: panel.onComposerSubmit,
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
    (text: string, files: File[]) =>
      source.createConversation({ text, files, ...overrides }),
    [source.createConversation, overrides],
  );
  const handleNotice = useCallback(
    (message: string) => addToast({ title: message }),
    [addToast],
  );
  const handleOpenLink = useCallback(
    (url: string) => {
      const path = source.activeAgent?.folderPath;
      if (path) openAgentHref(url, path);
    },
    [source.activeAgent],
  );

  const attachmentValidation = useAttachmentRejectionDialog();

  return (
    <>
      {source.toolbar}
      <div className="flex-1 min-h-0">
        <AIBoard
          items={source.items}
          columns={columns}
          selectedId={source.selectedId}
          highlightedId={source.highlightedId}
          onSelect={source.setSelectedId}
          feedItems={source.feedItems}
          isLoading={source.loading}
          onDelete={source.onDelete}
          onApprove={source.onApprove}
          onRename={source.onRename}
          onCreateConversation={handleCreateConversation}
          onSendMessage={sendQueue.handleSendMessage}
          sessionKeyFor={source.sessionKeyFor}
          queuedMessages={sendQueue.queuedMessages}
          onRemoveQueuedMessage={sendQueue.onRemoveQueuedMessage}
          queuedLabels={queuedLabels}
          onLoadHistory={source.loadHistory}
          onHistoryLoaded={source.onHistoryLoaded}
          onNewPanelOpenerReady={source.registerOpener}
          onPanelCloserReady={handleCloserReady}
          emptyState={source.emptyState}
          panelContainer={panelContainer}
          onPanelOpenChange={setMissionPanelOpen}
          onStopSession={source.stopSession}
          drafts={drafts}
          onDraftChange={onDraftChange}
          onNotice={handleNotice}
          composerLabels={composerLabels}
          prepareAttachments={attachmentValidation.prepareAttachments}
          onAttachmentRejections={attachmentValidation.onAttachmentRejections}
          onOpenLink={handleOpenLink}
          cardAvatar={source.cardAvatar}
          thinkingIndicator={panel.thinkingIndicator}
          endOfTurnIndicator={panel.endOfTurnIndicator}
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
          canSendEmpty={panel.canSendEmpty}
          onComposerSubmit={sendQueue.handleComposerSubmit}
          footer={panel.footer}
          attachMenu={panel.attachMenu}
          renderUserMessage={panel.renderUserMessage}
          renderSystemMessage={panel.renderSystemMessage}
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
