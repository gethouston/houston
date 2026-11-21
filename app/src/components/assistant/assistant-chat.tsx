import { AIBoard } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useOpenConversationFeed } from "../../hooks/use-open-conversation-feed";
import { useStartedMissionSummary } from "../../hooks/use-started-mission-summary";
import { useVisualViewportInset } from "../../hooks/use-visual-viewport-inset";
import { modelAcceptsImages } from "../../lib/providers";
import {
  type AssistantHandle,
  type HistoryLoadOptions,
  tauriChat,
} from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";
import { useBoardDrafts } from "../board/use-board-drafts";
import { useBoardLabels } from "../board/use-board-labels";
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { useQueuedMessageLabels } from "../use-queued-message-labels";
import { assistantAgent } from "./assistant-agent";
import { AssistantEmptyState } from "./assistant-empty-state";
import { AssistantPhoneHeader } from "./assistant-phone-header";
import { useOnboardingChatCards } from "./onboarding/use-onboarding-chat-cards";
import { useAssistantSend } from "./use-assistant-send";
import { useContextCommandMenu } from "./use-context-command-menu";

const noop = () => {};
const NO_ITEMS: never[] = [];

export function AssistantChat({ handle }: { handle: AssistantHandle }) {
  const { t } = useTranslation("assistant");
  const sessionKey = handle.conversation;
  const agent = useMemo(() => assistantAgent(handle, t("title")), [handle, t]);
  const path = agent.folderPath;

  const queuedLabels = useQueuedMessageLabels();
  const { labels, cardLabels, composerLabels } = useBoardLabels("assistant");
  const { draftStore } = useBoardDrafts();
  const addToast = useUIStore((s) => s.addToast);

  const panel = useAgentChatPanel({
    agent,
    integrationAccountScope: true,
    selectedSessionKey: sessionKey,
    onSelectSession: noop,
  });
  const renderStartedMissions = useStartedMissionSummary();
  const renderTurnSummary = useCallback(
    (summary: Parameters<NonNullable<typeof panel.renderTurnSummary>>[0]) => (
      <>
        {panel.renderTurnSummary?.(summary)}
        {renderStartedMissions(summary)}
      </>
    ),
    [panel.renderTurnSummary, renderStartedMissions],
  );
  const attachmentValidation = useAttachmentRejectionDialog({
    modelAcceptsImages: modelAcceptsImages(
      panel.effectiveProvider,
      panel.effectiveModel,
    ),
  });
  const { send, sendQueue } = useAssistantSend(agent, sessionKey, panel);
  const running = send.effectiveLoading[sessionKey] === true;
  const { sendAuthored } = sendQueue;
  const onboardingCards = useOnboardingChatCards({
    mapFeedItems: panel.mapFeedItems,
    renderSystemMessage: panel.renderSystemMessage,
    sendAuthored: useCallback(
      (text: string, context: string, grants: ["createAgent"]) =>
        sendAuthored(sessionKey, text, context, grants),
      [sendAuthored, sessionKey],
    ),
    running,
  });

  const attachMenu = useContextCommandMenu({
    base: panel.attachMenu,
    sessionKey,
    sendMessage: sendQueue.handleSendMessage,
    running,
  });

  const { feedItems, hasOlderMessages, onLoadOlderMessages } =
    useOpenConversationFeed(path, sessionKey);
  const loadHistory = useCallback(
    async (key: string, opts?: HistoryLoadOptions) =>
      (await tauriChat.loadHistory(path, key, opts)) as FeedItem[],
    [path],
  );
  const keyForSession = useCallback(() => sessionKey, [sessionKey]);
  const rootRef = useRef<HTMLDivElement>(null);
  const keyboardInset = useVisualViewportInset(rootRef);

  return (
    <div
      ref={rootRef}
      data-testid="assistant-chat"
      className="flex h-full min-h-0 flex-col pb-safe"
      style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
    >
      <AssistantPhoneHeader />
      <AIBoard
        panelOnly
        hidePanelClose
        items={NO_ITEMS}
        selectedId={sessionKey}
        onSelect={noop}
        sessionKeyFor={keyForSession}
        feedItems={feedItems}
        isLoading={send.effectiveLoading}
        onSendMessage={sendQueue.handleSendMessage}
        onComposerSubmit={panel.onComposerSubmit}
        queuedMessages={sendQueue.queuedMessages}
        onRemoveQueuedMessage={sendQueue.onRemoveQueuedMessage}
        queuedLabels={queuedLabels}
        onLoadHistory={loadHistory}
        onLoadOlderMessages={onLoadOlderMessages}
        hasOlderMessages={hasOlderMessages}
        onStopSession={send.stopSession}
        draftStore={draftStore}
        onOpenLink={panel.openHref}
        onNotice={(message) => addToast({ title: message })}
        labels={labels}
        composerAsksOpeningWhenEmpty
        cardLabels={cardLabels}
        composerLabels={composerLabels}
        hidePanelHeader
        chatEmptyState={<AssistantEmptyState />}
        composerHeader={panel.composerHeader}
        composerOverride={panel.composerOverride}
        composerOverrideMode={panel.composerOverrideMode}
        canSendEmpty={panel.canSendEmpty}
        footer={panel.footer}
        attachMenu={attachMenu}
        prepareAttachments={attachmentValidation.prepareAttachments}
        onAttachmentRejections={attachmentValidation.onAttachmentRejections}
        thinkingIndicator={panel.thinkingIndicator}
        renderUserMessage={panel.renderUserMessage}
        onEditMessage={panel.onEditMessage}
        canEditMessage={panel.canEditMessage}
        editMessageLabel={panel.editMessageLabel}
        enableMessageCopy={panel.enableMessageCopy}
        canCopyMessage={panel.canCopyMessage}
        copyMessageLabel={panel.copyMessageLabel}
        messageEditing={panel.messageEditing}
        renderLink={panel.renderLink}
        currentUserId={panel.currentUserId}
        authorLabels={panel.authorLabels}
        showSenders={panel.showSenders}
        agentLabel={panel.agentLabel}
        renderSenderAvatar={panel.renderSenderAvatar}
        senderNameClass={panel.senderNameClass}
        {...panel.mentionProps}
        dictation={panel.dictation}
        renderSystemMessage={onboardingCards.renderSystemMessage}
        conversationMap={panel.conversationMap}
        mapFeedItems={onboardingCards.mapFeedItems}
        afterMessages={panel.afterMessages}
        isSpecialTool={panel.isSpecialTool}
        renderToolResult={panel.renderToolResult}
        processLabels={panel.processLabels}
        getThinkingMessage={panel.getThinkingMessage}
        renderTurnSummary={renderTurnSummary}
      />
      {panel.pickerDialog}
      {attachmentValidation.dialog}
    </div>
  );
}
