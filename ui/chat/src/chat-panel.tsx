/**
 * ChatPanel -- THE single chat experience component.
 * Follows the Vercel AI Elements chatbot example exactly.
 * Generic version: accepts feedItems/status as props, no store dependencies.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Shimmer } from "./ai-elements/shimmer";
import { ChatDropOverlay } from "./chat-drop-overlay";
import { feedItemsToMessages } from "./chat-helpers";
import { ChatInput } from "./chat-input";
import { ChatMessages } from "./chat-messages";
import type { ChatPanelProps } from "./chat-panel-types";
import { deriveStatus } from "./chat-status";
import { useAttachmentIntake } from "./use-attachment-intake";
import { useControllable, useFileDropZone } from "./use-file-drop-zone";

export type { ChatPanelProps } from "./chat-panel-types";

const DefaultThinkingIndicator = () => (
  <div className="py-1">
    <Shimmer duration={2}>Thinking...</Shimmer>
  </div>
);

export function ChatPanel({
  sessionKey,
  feedItems,
  onSend,
  onStop,
  onBack,
  isLoading,
  placeholder = "Type a message...",
  emptyState,
  status: statusProp,
  thinkingIndicator,
  transformContent,
  toolLabels,
  isSpecialTool,
  renderToolResult,
  processLabels,
  getThinkingMessage,
  renderMessageAvatar,
  renderSystemMessage,
  contextCompactedLabel,
  renderUserMessage,
  afterMessages,
  renderTurnSummary,
  onOpenLink,
  renderLink,
  value,
  onValueChange,
  composerFocusToken,
  attachments,
  onAttachmentsChange,
  onNotice,
  prepareAttachments,
  onAttachmentRejections,
  footer,
  composerHeader,
  attachMenu,
  queuedMessages,
  onRemoveQueuedMessage,
  queuedLabels,
  canSendEmpty,
  composerOverride,
  composerOverrideMode = "above",
  composerLabels,
  dictation,
  currentUserId,
  authorLabels,
}: ChatPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const status = statusProp ?? deriveStatus(feedItems, isLoading);
  const messages = useMemo(() => feedItemsToMessages(feedItems), [feedItems]);
  const hasMessages = messages.length > 0;

  // Attachments state lives at ChatPanel level so the ENTIRE panel can act as
  // a drop target (not just the composer). When the parent passes controlled
  // props we forward them; otherwise we manage internally and clear on send.
  const [files, setFiles] = useControllable<File[]>(
    attachments,
    onAttachmentsChange,
    [],
  );
  const isFilesControlled = attachments !== undefined;
  const addDroppedFiles = useAttachmentIntake({
    files,
    setFiles,
    prepareAttachments,
    onAttachmentRejections,
    onNotice,
    duplicateNotice: composerLabels?.fileAlreadyInChat,
  });
  const { isDraggingOver, dropProps } = useFileDropZone(addDroppedFiles);

  useEffect(() => {
    if (composerFocusToken === undefined) return;
    panelRef.current
      ?.querySelector<HTMLTextAreaElement>('textarea[name="message"]')
      ?.focus();
  }, [composerFocusToken]);

  // Wrap onSend so we clear internally-managed attachments after a send;
  // in controlled mode the parent is responsible for clearing.
  const handleSend = useCallback(
    async (text: string, sent: File[]) => {
      await onSend(text, sent);
      if (!isFilesControlled) setFiles([]);
    },
    [onSend, isFilesControlled, setFiles],
  );

  return (
    <div
      ref={panelRef}
      className="relative flex flex-1 flex-col min-h-0 overflow-hidden bg-background dark:bg-transparent"
      {...dropProps}
    >
      <ChatDropOverlay
        visible={isDraggingOver}
        title={composerLabels?.dropTitle}
        description={composerLabels?.dropDescription}
      />
      {onBack && (
        <div className="max-w-3xl mx-auto w-full px-4 pt-3">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-ink-muted hover:text-ink transition-colors flex items-center gap-1"
          >
            <span>←</span> Back to chats
          </button>
        </div>
      )}
      {hasMessages || status !== "ready" ? (
        <ChatMessages
          // Remount the whole message list when the conversation changes.
          // Assistant text renders through Streamdown, a *streaming* markdown
          // renderer that appends incrementally and holds internal parse/DOM
          // state. Message keys are position-based ("assistant-1"), so they
          // collide across conversations and React reuses those Streamdown
          // instances on a session switch — swapping to a different mission's
          // final answer leaves the previous reply on screen (the user message,
          // plain text, updates; the assistant reply does not). Keying the list
          // by sessionKey resets the subtree so each conversation renders fresh
          // (#364). sessionKey is stable within a conversation, so live
          // streaming is unaffected.
          key={sessionKey}
          messages={messages}
          status={status}
          thinkingIndicator={thinkingIndicator ?? <DefaultThinkingIndicator />}
          transformContent={transformContent}
          toolLabels={toolLabels}
          isSpecialTool={isSpecialTool}
          renderToolResult={renderToolResult}
          processLabels={processLabels}
          getThinkingMessage={getThinkingMessage}
          renderMessageAvatar={renderMessageAvatar}
          renderSystemMessage={renderSystemMessage}
          contextCompactedLabel={contextCompactedLabel}
          renderUserMessage={renderUserMessage}
          afterMessages={afterMessages}
          renderTurnSummary={renderTurnSummary}
          onOpenLink={onOpenLink}
          renderLink={renderLink}
          currentUserId={currentUserId}
          authorLabels={authorLabels}
        />
      ) : (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          {emptyState}
        </div>
      )}

      {/* Default ("above"): the composer stays mounted at all times. A pending
          interaction renders its card ABOVE the input (both visible) rather
          than replacing it, so the user can always type a fresh message —
          doing so abandons the card. The override block drops the input's own
          top padding for its gap, avoiding doubled spacing between the two.
          "replace" hides the input entirely while the override is present, for
          surfaces whose override is the ONLY intended action (onboarding's
          one-button offer). */}
      {composerOverride && (
        <div className="shrink-0 px-4 pt-2 pb-3">
          <div className="max-w-3xl mx-auto">{composerOverride}</div>
        </div>
      )}
      {!(composerOverride && composerOverrideMode === "replace") && (
        <ChatInput
          onSend={handleSend}
          onStop={onStop}
          status={status}
          placeholder={placeholder}
          value={value}
          onValueChange={onValueChange}
          attachments={files}
          onAttachmentsChange={setFiles}
          onNotice={onNotice}
          prepareAttachments={prepareAttachments}
          onAttachmentRejections={onAttachmentRejections}
          footer={footer}
          header={composerHeader}
          attachMenu={attachMenu}
          queuedMessages={queuedMessages}
          onRemoveQueuedMessage={onRemoveQueuedMessage}
          queuedLabels={queuedLabels}
          canSendEmpty={canSendEmpty}
          labels={composerLabels}
          dictation={dictation}
        />
      )}
    </div>
  );
}
