import type { KanbanItem } from "@houston-ai/board";
import { AIBoard } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useConversationFeed } from "../../hooks/use-conversation-vm";
import { modelAcceptsImages } from "../../lib/providers";
import { type HistoryLoadOptions, tauriChat } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";
import { useAgentBoardSend } from "../board/use-agent-board-send";
import { useBoardLabels } from "../board/use-board-labels";
import { useBoardSendQueue } from "../board/use-board-send-queue";
import { useComposerSendOverrides } from "../board/use-composer-send-overrides";
import { AgentPanelAvatar } from "../shell/agent-panel-avatar";
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { useQueuedMessageLabels } from "../use-queued-message-labels";
import type { RoutineSetupChatBoardProps } from "./routine-setup-chat-board-props";
import { setupChatItem } from "./routines-tab-model";

const noop = () => {};

export function RoutineSetupChatBoard({
  agent,
  activity,
  sessionKey,
  panelContainer,
  panelLeading,
  missionLabel,
  panelActions,
  onPanelClose,
  promptContext,
  disableComposerAutoFocus,
}: RoutineSetupChatBoardProps) {
  const { t } = useTranslation("board");
  const path = agent.folderPath;
  const queuedLabels = useQueuedMessageLabels();
  const { labels, composerLabels } = useBoardLabels();
  const addToast = useUIStore((s) => s.addToast);

  const panel = useAgentChatPanel({
    agent,
    selectedSessionKey: sessionKey,
    onSelectSession: noop,
    initialTurnMode: "execute",
  });
  const attachmentValidation = useAttachmentRejectionDialog({
    modelAcceptsImages: modelAcceptsImages(
      panel.effectiveProvider,
      panel.effectiveModel,
    ),
  });
  const overrides = useComposerSendOverrides(panel);

  const rawItems = useMemo(() => [activity], [activity]);
  const send = useAgentBoardSend({
    agent,
    rawItems,
    openSessionKey: sessionKey,
    promptContext,
  });
  const sendQueue = useBoardSendQueue({
    selectedSessionKey: sessionKey,
    selectedAgentPath: path,
    overrides,
    resolveSendPin: panel.resolveSendPin,
    sendMessageNow: send.sendMessageNow,
  });

  const activeFeed = useConversationFeed(path, sessionKey);
  const feedItems = useMemo<Record<string, FeedItem[]>>(
    () => (sessionKey ? { [sessionKey]: activeFeed } : {}),
    [sessionKey, activeFeed],
  );
  const loadHistory = useCallback(
    async (key: string, opts?: HistoryLoadOptions) =>
      (await tauriChat.loadHistory(path, key, opts)) as FeedItem[],
    [path],
  );

  const keyForSession = useCallback(() => sessionKey ?? "", [sessionKey]);

  const items: KanbanItem[] = useMemo(
    () => [setupChatItem(activity, agent.name, sessionKey)],
    [activity, agent.name, sessionKey],
  );

  const running = activity.status === "running";

  const handlePanelSelect = useCallback(
    (id: string | null) => id === null && onPanelClose?.(),
    [onPanelClose],
  );

  return (
    <>
      <AIBoard
        layout="list"
        items={items}
        selectedId={activity.id}
        onSelect={onPanelClose ? handlePanelSelect : noop}
        panelContainer={panelContainer}
        hidePanelClose={onPanelClose ? undefined : true}
        disableComposerAutoFocus={disableComposerAutoFocus}
        feedItems={feedItems}
        isLoading={send.effectiveLoading}
        sessionKeyFor={keyForSession}
        onSendMessage={sendQueue.handleSendMessage}
        onComposerSubmit={panel.onComposerSubmit}
        queuedMessages={sendQueue.queuedMessages}
        onRemoveQueuedMessage={sendQueue.onRemoveQueuedMessage}
        queuedLabels={queuedLabels}
        onLoadHistory={loadHistory}
        onStopSession={send.stopSession}
        onOpenLink={panel.openHref}
        onNotice={(message) => addToast({ title: message })}
        composerOverride={panel.composerOverride}
        composerOverrideMode={panel.composerOverrideMode}
        labels={labels}
        composerLabels={composerLabels}
        prepareAttachments={attachmentValidation.prepareAttachments}
        onAttachmentRejections={attachmentValidation.onAttachmentRejections}
        thinkingIndicator={panel.thinkingIndicator}
        panelLeading={panelLeading}
        panelActions={panelActions ? () => panelActions : undefined}
        panelAgentName={agent.name}
        panelMissionLabel={
          missionLabel ?? t("board:panel.taskLabel", { title: activity.title })
        }
        panelAvatar={<AgentPanelAvatar color={agent.color} running={running} />}
        chatEmptyState={panel.chatEmptyState}
        composerHeader={panel.composerHeader}
        canSendEmpty={panel.canSendEmpty}
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
        currentUserId={panel.currentUserId}
        authorLabels={panel.authorLabels}
        showSenders={panel.showSenders}
        agentLabel={panel.agentLabel}
        renderSenderAvatar={panel.renderSenderAvatar}
        senderNameClass={panel.senderNameClass}
        {...panel.mentionProps}
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
      {panel.pickerDialog}
      {attachmentValidation.dialog}
    </>
  );
}
