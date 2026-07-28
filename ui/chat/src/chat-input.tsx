import { cn } from "@houston-ai/core";
import { useCallback } from "react";
import type { PromptInputMessage } from "./ai-elements/prompt-input";
import { ChatInputAttachments } from "./chat-input-attachments";
import { ChatInputForm } from "./chat-input-form.tsx";
import { ChatInputMentions } from "./chat-input-mentions.tsx";
import type { ChatInputProps } from "./chat-input-types";
import { isDictationActive, isDictationCapturing } from "./dictation-types";
import { QueuedMessageList } from "./queued-message-list";
import { useComposerAttachments } from "./use-composer-attachments";
import { useDictationHotkeys } from "./use-dictation-hotkeys.ts";
import { useControllable } from "./use-file-drop-zone";
import { useMentionCombobox } from "./use-mention-combobox.ts";

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
  mentionPeople,
  renderMentionAvatar,
  mentionLabels,
  draftKey,
}: ChatInputProps) {
  const [text, setText] = useControllable(value, onValueChange, "");
  const isTextControlled = value !== undefined;
  const {
    files,
    setFiles,
    isFilesControlled,
    fileInputRef,
    folderInputRef,
    handleFileChange,
    handlePaste,
    openFilePicker,
    openFolderPicker,
    removeFiles,
  } = useComposerAttachments({
    attachments,
    onAttachmentsChange,
    prepareAttachments,
    onAttachmentRejections,
    onNotice,
    labels,
  });
  const mentions = useMentionCombobox({
    people: mentionPeople,
    enabled: !disabled && !isDictationCapturing(dictation),
    draftKey,
    onTextChange: setText,
  });

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      mentions.refresh(e.target);
    },
    [setText, mentions.refresh],
  );

  const handleCaretMove = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) =>
      mentions.refresh(e.currentTarget),
    [mentions.refresh],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // The mention list gets first say: every key it consumes is
      // `preventDefault()`ed, which is what makes PromptInputTextarea bail
      // before its own Enter handling and keeps Escape off the stop handler.
      mentions.onKeyDown(e);
      if (e.defaultPrevented) return;
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
    [status, onStop, dictation, mentions.onKeyDown],
  );

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      if (disabled) return;
      const trimmed = message.text?.trim();
      if (!trimmed && files.length === 0 && !canSendEmpty) return;
      const sent = trimmed ?? "";
      // Snapshot, never consume: a rejected `onSend` keeps the text in the
      // composer, so it has to keep the mentions that text refers to. Text and
      // mentions clear together, once the send actually landed.
      await onSend(sent, files, mentions.mentionsFor(sent));
      mentions.commitSent();
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
      mentions.mentionsFor,
      mentions.commitSent,
    ],
  );

  const hasContent = canSendEmpty || text.trim().length > 0 || files.length > 0;
  const dictating = isDictationActive(dictation);
  useDictationHotkeys(dictation);

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
          folderInputRef={folderInputRef}
          files={files}
          onFileChange={handleFileChange}
          onRemoveFiles={removeFiles}
          folderCountLabel={labels?.folderFileCount}
        />

        <QueuedMessageList
          messages={queuedMessages}
          onRemove={onRemoveQueuedMessage}
          labels={queuedLabels}
        />

        <ChatInputMentions
          {...mentions.list}
          listAriaLabel={mentionLabels?.listAriaLabel}
          renderAvatar={renderMentionAvatar}
        >
          <ChatInputForm
            attachMenu={attachMenu}
            dictating={dictating}
            dictation={dictation}
            disabled={disabled}
            hasContent={hasContent}
            header={header}
            mentionCombobox={mentions.combobox}
            onKeyDown={handleKeyDown}
            onOpenFilePicker={openFilePicker}
            onOpenFolderPicker={openFolderPicker}
            onPaste={handlePaste}
            onSelect={handleCaretMove}
            onStop={onStop}
            onSubmit={handleSubmit}
            onTextChange={handleTextChange}
            placeholder={placeholder}
            status={status}
            text={text}
          />
        </ChatInputMentions>

        {footer && (
          <div className="flex items-center px-2.5 pt-1">{footer}</div>
        )}
      </div>
    </div>
  );
}
