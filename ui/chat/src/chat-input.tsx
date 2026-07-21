import { cn } from "@houston-ai/core";
import { useCallback, useEffect } from "react";
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
import { isDictationActive, isDictationCapturing } from "./dictation-types";
import { DictationWaveform } from "./dictation-waveform";
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
  disabled = false,
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
      if (disabled) return;
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
      disabled,
      isTextControlled,
      isFilesControlled,
      setText,
      setFiles,
    ],
  );

  const hasContent = canSendEmpty || text.trim().length > 0 || files.length > 0;
  const dictating = isDictationActive(dictation);

  // While capturing, the textarea (which owns the keydown handler) is replaced
  // by the waveform, so Escape/Enter have no focus target. Listen globally for
  // the duration of the capture instead: Escape discards, Enter (no shift)
  // accepts — the same as clicking ✓ (stop + transcribe). During transcribing
  // this effect is inactive (not a capturing state), so Enter does nothing.
  const capturing = isDictationCapturing(dictation);
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dictation?.onCancel();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        dictation?.onStop();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [capturing, dictation]);

  return (
    <div className="shrink-0 px-4 pb-6 pt-2">
      <div
        className={cn(
          "max-w-3xl mx-auto relative transition-opacity",
          disabled && "pointer-events-none opacity-60",
        )}
        aria-disabled={disabled || undefined}
      >
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
            disabled={disabled}
          />

          <PromptInputBody>
            {dictating && dictation ? (
              <DictationWaveform control={dictation} />
            ) : (
              <PromptInputTextarea
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                value={text}
                placeholder={placeholder}
                disabled={disabled}
              />
            )}
          </PromptInputBody>

          <ComposerTrailing
            status={status}
            hasContent={hasContent}
            onStop={onStop}
            dictation={dictation}
            disabled={disabled}
          />
        </PromptInput>

        {footer && (
          <div className="flex items-center px-2.5 pt-1">{footer}</div>
        )}
      </div>
    </div>
  );
}
