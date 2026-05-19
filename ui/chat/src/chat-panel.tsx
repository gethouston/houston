/**
 * ChatPanel -- THE single chat experience component.
 * Follows the Vercel AI Elements chatbot example exactly.
 * Generic version: accepts feedItems/status as props, no store dependencies.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { feedItemsToMessages } from "./chat-helpers";
import { ChatInput } from "./chat-input";
import { ChatDropOverlay } from "./chat-drop-overlay";
import { ChatMessages } from "./chat-messages";
import type { ChatPanelProps } from "./chat-panel-types";
import { deriveStatus } from "./chat-status";
import { Shimmer } from "./ai-elements/shimmer";
import { useFileDropZone, useControllable } from "./use-file-drop-zone";
import { useAttachmentIntake } from "./use-attachment-intake";

export type { ChatPanelProps } from "./chat-panel-types";

const DefaultThinkingIndicator = () => (
  <div className="py-1">
    <Shimmer duration={2}>Thinking...</Shimmer>
  </div>
);

export function ChatPanel({
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
  queuedMessages,
  onRemoveQueuedMessage,
  queuedLabels,
  canSendEmpty,
  composerOverride,
  composerLabels,
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
      className="relative flex flex-1 flex-col min-h-0 overflow-hidden"
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
            onClick={onBack}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <span>←</span> Back to chats
          </button>
        </div>
      )}
      {hasMessages || status !== "ready" ? (
        <ChatMessages
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
          renderUserMessage={renderUserMessage}
          afterMessages={afterMessages}
          renderTurnSummary={renderTurnSummary}
          onOpenLink={onOpenLink}
          renderLink={renderLink}
        />
      ) : (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          {emptyState}
        </div>
      )}

      {composerOverride ? (
        <div className="shrink-0 px-4 pb-6 pt-2">
          <div className="max-w-3xl mx-auto">{composerOverride}</div>
        </div>
      ) : (
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
          queuedMessages={queuedMessages}
          onRemoveQueuedMessage={onRemoveQueuedMessage}
          queuedLabels={queuedLabels}
          canSendEmpty={canSendEmpty}
          labels={composerLabels}
        />
      )}
    </div>
  );
}
