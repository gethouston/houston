import { useCallback } from "react";
import type { PromptInputMessage } from "./ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputBody,
  PromptInputHeader,
  PromptInputTextarea,
} from "./ai-elements/prompt-input";
import { ComposerTrailing } from "./attachment-chip";
import {
  ChatInputAttachButton,
  ChatInputAttachments,
} from "./chat-input-attachments";
import type { ChatInputProps } from "./chat-input-types";
import { isDictationCapturing } from "./dictation-types";
import { QueuedMessageList } from "./queued-message-list";
import { useComposerAttachments } from "./use-composer-attachments";
import { useControllable } from "./use-file-drop-zone";

export type { ChatInputProps } from "./chat-input-types";
export type { ChatComposerLabels } from "./chat-panel-types";

export function ChatInput({
  value,
  onValueChange,
  attachments,
  onAttachmentsChange,
  onSend,
  onStop,
  status = "ready",
  placeholder = "Type a message...",
  onNotice,
  prepareAttachments,
  onAttachmentRejections,
  footer,
  header,
  attachMenu,
  queuedMessages = [],
  onRemoveQueuedMessage,
  queuedLabels,
  canSendEmpty = false,
  labels,
  dictation,
}: ChatInputProps) {
  const [text, setText] = useControllable(value, onValueChange, "");
  const isTextControlled = value !== undefined;
  const {
    files,
    setFiles,
    isFilesControlled,
    fileInputRef,
    handleFileChange,
    handlePaste,
    openFilePicker,
    removeFile,
  } = useComposerAttachments({
    attachments,
    onAttachmentsChange,
    prepareAttachments,
    onAttachmentRejections,
    onNotice,
    labels,
  });

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => setText(e.target.value),
    [setText],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Escape discards an in-flight capture first, before any streaming stop.
      if (e.key === "Escape" && isDictationCapturing(dictation)) {
        e.preventDefault();
        dictation?.onCancel();
        return;
      }
      if (e.key === "Escape" && status !== "ready" && onStop) {
        e.preventDefault();
        onStop();
      }
    },
    [status, onStop, dictation],
  );

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const trimmed = message.text?.trim();
      if (!trimmed && files.length === 0 && !canSendEmpty) return;
      await onSend(trimmed ?? "", files);
      // In uncontrolled mode, clear our own state. In controlled mode the
      // parent is responsible for clearing.
      if (!isTextControlled) setText("");
      if (!isFilesControlled) setFiles([]);
    },
    [
      onSend,
      files,
      canSendEmpty,
      isTextControlled,
      isFilesControlled,
      setText,
      setFiles,
    ],
  );

  const hasContent = canSendEmpty || text.trim().length > 0 || files.length > 0;

  return (
    <div className="shrink-0 px-4 pb-6 pt-2">
      <div className="max-w-3xl mx-auto relative">
        <ChatInputAttachments
          fileInputRef={fileInputRef}
          files={files}
          onFileChange={handleFileChange}
          onRemoveFile={removeFile}
        />

        <QueuedMessageList
          messages={queuedMessages}
          onRemove={onRemoveQueuedMessage}
          labels={queuedLabels}
        />

        <PromptInput onSubmit={handleSubmit}>
          {header && (
            <PromptInputHeader className="pb-1">{header}</PromptInputHeader>
          )}

          <ChatInputAttachButton
            onOpenFilePicker={openFilePicker}
            attachMenu={attachMenu}
          />

          <PromptInputBody>
            <PromptInputTextarea
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              value={text}
              placeholder={placeholder}
            />
          </PromptInputBody>

          <ComposerTrailing
            status={status}
            hasContent={hasContent}
            onStop={onStop}
            dictation={dictation}
          />
        </PromptInput>

        {footer && (
          <div className="flex items-center px-2.5 pt-1">{footer}</div>
        )}
      </div>
    </div>
  );
}
