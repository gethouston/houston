import { useCallback, useRef } from "react";
import type { ReactNode } from "react";
import type { AttachmentRejection, PrepareAttachments } from "./chat-panel-types";
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
import { filesFromClipboardData } from "./clipboard-files";
import { QueuedMessageList } from "./queued-message-list";
import type { QueuedChatMessage, QueuedMessageLabels } from "./queued-message-list";
import { useControllable, mergeUniqueFiles } from "./use-file-drop-zone";

type InputStatus = "ready" | "streaming" | "submitted";

export interface ChatComposerLabels {
  fileAlreadyInChat?: string;
  dropTitle?: string;
  dropDescription?: string;
}

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
  queuedMessages = [],
  onRemoveQueuedMessage,
  queuedLabels,
  canSendEmpty = false,
  labels,
}: ChatInputProps) {
  const [text, setText] = useControllable(value, onValueChange, "");
  const [files, setFiles] = useControllable<File[]>(
    attachments,
    onAttachmentsChange,
    [],
  );
  const isTextControlled = value !== undefined;
  const isFilesControlled = attachments !== undefined;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFiles = useCallback(
    (incoming: File[]) => {
      const prepared = prepareAttachments
        ? prepareAttachments(incoming, files)
        : { accepted: incoming, rejected: [] };
      if (prepared.rejected.length > 0) {
        onAttachmentRejections?.(prepared.rejected);
      }
      const merged = mergeUniqueFiles(files, prepared.accepted);
      if (merged.length < files.length + prepared.accepted.length) {
        onNotice?.(labels?.fileAlreadyInChat ?? "File already in chat");
      }
      setFiles(merged);
    },
    [files, setFiles, onNotice, prepareAttachments, onAttachmentRejections, labels],
  );

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
    [onSend, files, canSendEmpty, isTextControlled, isFilesControlled, setText, setFiles],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      addFiles(Array.from(e.target.files));
      e.target.value = "";
    },
    [addFiles],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pasted = filesFromClipboardData(e.clipboardData);
      if (pasted.length === 0) return;
      e.preventDefault();
      addFiles(pasted);
    },
    [addFiles],
  );

  const openFilePicker = useCallback(() => {
    const input = fileInputRef.current;
    if (!input) return;
    // Reset BEFORE click so the same file can be re-picked and so WKWebView
    // doesn't hold onto stale state between invocations.
    input.value = "";
    input.click();
  }, []);

  const removeFile = useCallback(
    (index: number) => setFiles(files.filter((_, i) => i !== index)),
    [files, setFiles],
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
            <PromptInputHeader className="pb-1">
              {header}
            </PromptInputHeader>
          )}

          <ChatInputAttachButton onOpenFilePicker={openFilePicker} />

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
          <div className="flex items-center px-1 pt-1">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
