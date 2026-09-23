/**
 * The routine chat's actual AIBoard mount, split out of `routine-setup-chat.tsx`
 * to keep that file focused on layout/chrome. Rendered inside a `hidden` wrapper
 * by the caller: the board's own list never shows, only its portaled detail
 * panel (into the shell-level panel container) — it fills the big right-hand
 * panel, the SAME one the Activity mission board opens, for a routine's chat.
 */

import type { KanbanItem } from "@houston-ai/board";
import { AIBoard } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useConversationFeed } from "../../hooks/use-conversation-vm";
import { useOpenAgentHref } from "../../hooks/use-open-agent-file";
import { modelAcceptsImages } from "../../lib/providers";
import { type HistoryLoadOptions, tauriChat } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";
import { useAgentBoardSend } from "../board/use-agent-board-send";
import { useBoardLabels } from "../board/use-board-labels";
import { useBoardSendQueue } from "../board/use-board-send-queue";
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
  const openHref = useOpenAgentHref(path);
  const queuedLabels = useQueuedMessageLabels();
  const { labels, composerLabels } = useBoardLabels();
  const addToast = useUIStore((s) => s.addToast);

  const panel = useAgentChatPanel({
    agent,
    selectedSessionKey: sessionKey,
    onSelectSession: noop,
    // The setup chat's kickoff turn runs Ask first (execute) — the interview
    // needs ask_user and must never open read-only in Planner — so the live
    // composer opens on Ask first too. The user can still switch modes here.
    initialTurnMode: "execute",
  });
  const attachmentValidation = useAttachmentRejectionDialog({
    modelAcceptsImages: modelAcceptsImages(
      panel.effectiveProvider,
      panel.effectiveModel,
    ),
  });
  const overrides = useMemo(
    () => ({
      providerOverride: panel.effectiveProvider,
      modelOverride: panel.effectiveModel,
      modeOverride: panel.turnMode,
    }),
    [panel.effectiveProvider, panel.effectiveModel, panel.turnMode],
  );

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

  // Stable identity: AIBoard folds `sessionKeyFor` into its `hydrateSession`
  // callback, and its composer-autofocus effect is keyed on that callback. An
  // inline arrow gave it a fresh identity every render, re-firing the effect
  // and re-focusing the composer on EVERY chat re-render (a streaming/settling
  // reply, an activity refetch) instead of once on open — the composer would
  // yank focus back from wherever the user clicked. useCallback makes the
  // autofocus one-shot, matching every other AIBoard consumer.
  const keyForSession = useCallback(() => sessionKey ?? "", [sessionKey]);

  const items: KanbanItem[] = useMemo(
    () => [setupChatItem(activity, agent.name, sessionKey)],
    [activity, agent.name, sessionKey],
  );

  const running = activity.status === "running";

  // The panel's close X clears the board's selection (`onSelect(null)`) — route
  // that to deselect (non-null selects, from the hidden card, are ignored).
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
        // The close X shows only when a deselect handler is wired (`onPanelClose`).
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
        onOpenLink={openHref}
        onNotice={(message) => addToast({ title: message })}
        // The ask_user question card that replaces the composer when the
        // turn settles needs_you — the interview IS this card, so dropping
        // it turns the guided setup into a dead chat.
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
