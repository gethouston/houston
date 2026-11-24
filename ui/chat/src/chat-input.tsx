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
import { useComposerDraft } from "./use-composer-draft";
import { useComposerKeyDown } from "./use-composer-key-down";
import { useDictationHotkeys } from "./use-dictation-hotkeys.ts";
import { useControllable } from "./use-file-drop-zone";
import { useMentionCombobox } from "./use-mention-combobox.ts";

const DEFAULT_QUEUED_MESSAGES: never[] = [];

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
  queuedMessages = DEFAULT_QUEUED_MESSAGES,
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
  draftStore,
}: ChatInputProps) {
  const draft = useComposerDraft(draftStore, draftKey);
  const controlledText = draft ? draft.text : value;
  const [text, setText] = useControllable(
    controlledText,
    draft ? draft.set : onValueChange,
    "",
  );
  const isTextControlled = controlledText !== undefined;
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

  const mentionsRefresh = mentions.refresh;
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      mentionsRefresh(e.target);
    },
    [setText, mentionsRefresh],
  );

  const handleCaretMove = useCallback(
    (e: React.SyntheticEvent<HTMLTextAreaElement>) =>
      mentionsRefresh(e.currentTarget),
    [mentionsRefresh],
  );

  const handleKeyDown = useComposerKeyDown({
    mentionKeyDown: mentions.onKeyDown,
    dictation,
    status,
    onStop,
  });

  const mentionsMentionsFor = mentions.mentionsFor;
  const mentionsCommitSent = mentions.commitSent;
  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      if (disabled) return;
      const trimmed = message.text?.trim();
      if (!trimmed && files.length === 0 && !canSendEmpty) return;
      const sent = trimmed ?? "";
      // Snapshot, never consume: a rejected `onSend` keeps the text in the
      // composer, so it has to keep the mentions that text refers to. Text and
      // mentions clear together, once the send actually landed.
      await onSend(sent, files, mentionsMentionsFor(sent));
      mentionsCommitSent();
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
      mentionsMentionsFor,
      mentionsCommitSent,
    ],
  );

  const hasContent = canSendEmpty || text.trim().length > 0 || files.length > 0;
  const dictating = isDictationActive(dictation);
  useDictationHotkeys(dictation);

  return (
    // The phone keeps the composer tight to what sits below it (the home
    // indicator's safe area, or the keyboard); desktop keeps its air.
    <div className="shrink-0 px-4 pb-2 pt-2 md:pb-6">
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
          removeLabel={labels?.removeAttachment}
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
            labels={labels}
          />
        </ChatInputMentions>

        {footer && (
          <div className="flex items-center px-2.5 pt-1">{footer}</div>
        )}
      </div>
    </div>
  );
}
