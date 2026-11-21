import { useEffect, useMemo, useRef } from "react";
import { ChatDropOverlay } from "./chat-drop-overlay";
import { feedItemsToMessages } from "./chat-helpers";
import { ChatInput } from "./chat-input";
import { ChatPanelLog } from "./chat-panel-log";
import type { ChatPanelProps } from "./chat-panel-types";
import { deriveStatus } from "./chat-status";
import {
  type PanelAttachments,
  PanelAttachmentsContext,
} from "./panel-attachments-context";
import { useChatPanelAttachments } from "./use-chat-panel-attachments";

export type { ChatPanelProps } from "./chat-panel-types";

export function ChatPanel(props: ChatPanelProps) {
  const {
    sessionKey,
    feedItems,
    onStop,
    onBack,
    isLoading,
    placeholder = "Type a message...",
    status: statusProp,
    value,
    onValueChange,
    draftStore,
    composerFocusToken,
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
    composerDisabled,
    composerOverride,
    composerOverrideMode = "above",
    composerLabels,
    dictation,
    mentionPeople,
    renderMentionAvatar,
    mentionLabels,
  } = props;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const status = statusProp ?? deriveStatus(feedItems, isLoading);
  const messages = useMemo(() => feedItemsToMessages(feedItems), [feedItems]);
  const {
    files,
    setFiles,
    releaseFiles,
    addDroppedFiles,
    handleSend,
    isDraggingOver,
    dropProps,
  } = useChatPanelAttachments(props);
  const panelAttachments = useMemo<PanelAttachments>(
    () => ({
      files,
      setFiles,
      releaseFiles,
      addDroppedFiles,
      prepareAttachments,
      onAttachmentRejections,
      onNotice,
      composerLabels,
    }),
    [
      files,
      setFiles,
      releaseFiles,
      addDroppedFiles,
      prepareAttachments,
      onAttachmentRejections,
      onNotice,
      composerLabels,
    ],
  );

  useEffect(() => {
    if (composerFocusToken === undefined) return;
    panelRef.current
      ?.querySelector<HTMLTextAreaElement>('textarea[name="message"]')
      ?.focus();
  }, [composerFocusToken]);

  return (
    <div
      ref={panelRef}
      className="relative flex flex-1 flex-col min-h-0 overflow-hidden bg-pane"
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
      <ChatPanelLog {...props} messages={messages} status={status} />

      {composerOverride && (
        <div className="shrink-0 px-4 pt-2 pb-3">
          <div className="max-w-3xl mx-auto">
            <PanelAttachmentsContext.Provider
              value={
                composerOverrideMode === "replace" ? panelAttachments : null
              }
            >
              {composerOverride}
            </PanelAttachmentsContext.Provider>
          </div>
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
          disabled={composerDisabled}
          labels={composerLabels}
          dictation={dictation}
          mentionPeople={mentionPeople}
          renderMentionAvatar={renderMentionAvatar}
          mentionLabels={mentionLabels}
          draftKey={sessionKey}
          draftStore={draftStore}
        />
      )}
    </div>
  );
}
