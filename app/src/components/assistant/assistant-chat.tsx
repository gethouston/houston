import { AIBoard } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useOpenAgentHref } from "../../hooks/use-open-agent-file";
import { useOpenConversationFeed } from "../../hooks/use-open-conversation-feed";
import { useVisualViewportInset } from "../../hooks/use-visual-viewport-inset";
import { modelAcceptsImages } from "../../lib/providers";
import {
  type AssistantHandle,
  type HistoryLoadOptions,
  tauriChat,
} from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";
import { useAgentBoardSend } from "../board/use-agent-board-send";
import { useBoardDrafts } from "../board/use-board-drafts";
import { useBoardLabels } from "../board/use-board-labels";
import { useBoardSendQueue } from "../board/use-board-send-queue";
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { useQueuedMessageLabels } from "../use-queued-message-labels";
import { assistantAgent } from "./assistant-agent";
import { AssistantEmptyState } from "./assistant-empty-state";
import { useContextCommandMenu } from "./use-context-command-menu";

const noop = () => {};
/** The assistant never lists missions: `panelOnly` renders the chat alone. */
const NO_ITEMS: never[] = [];

/**
 * The 1-on-1 assistant chat, filling its screen.
 *
 * The assistant is an ordinary agent conversation, so this is the app's own
 * chat: `useAgentChatPanel` supplies the same composer, model picker, skills,
 * interaction cards, tool rendering and attachments every mission chat gets,
 * and AIBoard's `panelOnly` mode renders the detail panel as the whole surface
 * — the same presentation the phone's pushed mission chat uses. Nothing here
 * re-implements chat behavior; the SDK conversation VM stays the one source of
 * turns (history seeded by `useAgentChatPanel`'s own `useChatHistory`, live
 * turns folded by the SDK, older pages fetched on scroll-up).
 *
 * It creates NO activity record, which is what keeps it out of every board,
 * unread count and mention sweep: those read activity rows, and the assistant
 * has none. The conversation is fixed and permanent (`handle.conversation`),
 * so there is no selection to make and no create path to reach.
 */
export function AssistantChat({ handle }: { handle: AssistantHandle }) {
  const { t } = useTranslation("assistant");
  const sessionKey = handle.conversation;
  const agent = useMemo(() => assistantAgent(handle, t("title")), [handle, t]);
  const path = agent.folderPath;

  const openHref = useOpenAgentHref(path);
  const queuedLabels = useQueuedMessageLabels();
  const { cardLabels, composerLabels } = useBoardLabels();
  const { drafts, onDraftChange } = useBoardDrafts();
  const addToast = useUIStore((s) => s.addToast);

  const panel = useAgentChatPanel({
    agent,
    selectedSessionKey: sessionKey,
    onSelectSession: noop,
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

  // No board behind this chat (`rawItems: undefined`, not an empty board): the
  // send hook's per-conversation loading then follows the SDK conversation VM
  // alone, which is the only lifecycle signal an activity-less chat has — it
  // starts the spinner on the turn and ends it on the settle.
  const send = useAgentBoardSend({
    agent,
    rawItems: undefined,
    openSessionKey: sessionKey,
  });
  const sendQueue = useBoardSendQueue({
    selectedSessionKey: sessionKey,
    selectedAgentPath: path,
    overrides,
    sendMessageNow: send.sendMessageNow,
  });

  // The composer "+" menu gains the two conversation commands. They travel as
  // ordinary messages (the runtime reads them at the turn route), so the menu
  // is a shortcut for typing them, never a second path.
  const attachMenu = useContextCommandMenu({
    base: panel.attachMenu,
    sessionKey,
    sendMessage: sendQueue.handleSendMessage,
    running: send.effectiveLoading[sessionKey] === true,
  });

  const { feedItems, hasOlderMessages, onLoadOlderMessages } =
    useOpenConversationFeed(path, sessionKey);
  const loadHistory = useCallback(
    async (key: string, opts?: HistoryLoadOptions) =>
      (await tauriChat.loadHistory(path, key, opts)) as FeedItem[],
    [path],
  );
  // Stable identity: AIBoard folds this into its `hydrateSession` callback and
  // keys the composer-autofocus effect on it, so an inline arrow would re-focus
  // the composer on every streamed token.
  const keyForSession = useCallback(() => sessionKey, [sessionKey]);
  const rootRef = useRef<HTMLDivElement>(null);
  const keyboardInset = useVisualViewportInset(rootRef);

  return (
    <div
      ref={rootRef}
      data-testid="assistant-chat"
      className="flex h-full min-h-0 flex-col"
      // iOS does not shrink `dvh` when the keyboard opens, so the composer of a
      // full-height chat would sit under the keys. Zero on desktop and whenever
      // nothing occludes, so the one style serves both breakpoints.
      style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
    >
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
        drafts={drafts}
        onDraftChange={onDraftChange}
        onOpenLink={openHref}
        onNotice={(message) => addToast({ title: message })}
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
    </div>
  );
}
