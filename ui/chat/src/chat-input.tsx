import { useCallback } from "react";
import type { ReactNode } from "react";
import type {
  AttachmentRejection,
  ChatComposerLabels,
  PrepareAttachments,
} from "./chat-panel-types";
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
import { QueuedMessageList } from "./queued-message-list";
import type {
  QueuedChatMessage,
  QueuedMessageLabels,
} from "./queued-message-list";
import { useControllable } from "./use-file-drop-zone";
import { useComposerAttachments } from "./use-composer-attachments";

type InputStatus = "ready" | "streaming" | "submitted";

export type { ChatComposerLabels } from "./chat-panel-types";

export interface ChatInputProps {
  /** Controlled text. Omit to use internal state. */
  value?: string;
  /** Required if `value` is provided. */
  onValueChange?: (value: string) => void;
  /** Controlled attachments. Omit to use internal state. */
  attachments?: File[];
  /** Required if `attachments` is provided. */
  onAttachmentsChange?: (files: File[]) => void;
  /** Called on submit. The current text + files are always passed for convenience. */
  onSend: (text: string, files: File[]) => void | Promise<void>;
  onStop?: () => void;
  status?: InputStatus;
  placeholder?: string;
  /** Emitted when the library wants to surface a short notice to the user
   *  (e.g. a duplicate-file drop). The app decides how to display it. */
  onNotice?: (message: string) => void;
  prepareAttachments?: PrepareAttachments;
  onAttachmentRejections?: (rejections: AttachmentRejection[]) => void;
  /** Optional content rendered in the composer footer (e.g. model selector). */
  footer?: ReactNode;
  /** Optional content rendered inside the composer above the textarea. */
  header?: ReactNode;
  /** Optional menu rendered in a popover anchored to the paperclip button.
   *  When provided, clicking the button opens the popover instead of going
   *  straight to the file picker. The render-prop form receives an API the
   *  caller can use to trigger the file picker from inside the menu. */
  attachMenu?:
    | ReactNode
    | ((api: { openFilePicker: () => void; close: () => void }) => ReactNode);
  /** Messages accepted while a turn is active, waiting to be sent as one turn. */
  queuedMessages?: QueuedChatMessage[];
  onRemoveQueuedMessage?: (id: string) => void;
  queuedLabels?: QueuedMessageLabels;
  /** Enables submit even when text/files are empty. */
  canSendEmpty?: boolean;
  labels?: ChatComposerLabels;
}

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
      if (e.key === "Escape" && status !== "ready" && onStop) {
        e.preventDefault();
        onStop();
      }
    },
    [status, onStop],
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
          />
        </PromptInput>

        {footer && (
          <div className="flex items-center px-2.5 pt-1">{footer}</div>
        )}
      </div>
    </div>
  );
}
