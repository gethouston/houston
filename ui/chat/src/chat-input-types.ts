import type { ReactNode } from "react";
import type {
  AttachmentRejection,
  ChatComposerLabels,
  PrepareAttachments,
} from "./chat-panel-types";
import type { DictationControl } from "./dictation-types";
import type {
  QueuedChatMessage,
  QueuedMessageLabels,
} from "./queued-message-list";

export type InputStatus = "ready" | "streaming" | "submitted";

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
  /** Prop-driven dictation affordance. Omit to hide the mic (web build). */
  dictation?: DictationControl;
}
