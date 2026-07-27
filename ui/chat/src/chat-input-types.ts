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
import type { MentionPerson, MessageMention } from "./types";

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
  /** Called on submit. The current text + files are always passed for
   *  convenience; `mentions` (HOU-944) are the pending @mentions whose "@Name"
   *  text survived into the sent message, `[]` when there are none. */
  onSend: (
    text: string,
    files: File[],
    mentions: MessageMention[],
  ) => void | Promise<void>;
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
   *  caller can use to trigger the file or folder picker from inside the
   *  menu. */
  attachMenu?:
    | ReactNode
    | ((api: {
        openFilePicker: () => void;
        openFolderPicker: () => void;
        close: () => void;
      }) => ReactNode);
  /** Messages accepted while a turn is active, waiting to be sent as one turn. */
  queuedMessages?: QueuedChatMessage[];
  onRemoveQueuedMessage?: (id: string) => void;
  queuedLabels?: QueuedMessageLabels;
  /** Enables submit even when text/files are empty. */
  canSendEmpty?: boolean;
  /** Locks the whole composer inert (textarea, attach, submit) and dims it —
   *  no typing, no send. Used while an interaction owns the turn. */
  disabled?: boolean;
  labels?: ChatComposerLabels;
  /** Prop-driven dictation affordance. Omit to hide the mic (web build). */
  dictation?: DictationControl;
  /** Teammates the user can @mention (HOU-944), in the order they should be
   *  offered. Empty or absent means the popover NEVER opens and "@" types
   *  plainly, which is what single-player, a personal space, and a gateway
   *  too old to serve the roster all look like. */
  mentionPeople?: readonly MentionPerson[];
  /** Avatar for a row in the mention list, so a teammate keeps their own
   *  face/tone. Omit to show the name alone. */
  renderMentionAvatar?: (person: MentionPerson) => ReactNode;
  /** Localized labels for the mention list. English defaults live here; the
   *  app passes `t()` results in (the library stays i18n-agnostic). */
  mentionLabels?: { listAriaLabel?: string };
  /** Opaque identity of the draft this composer is writing — the consumer's
   *  session/conversation key. Composer TEXT is already parked per draft by
   *  the app; the @mention picks recorded beside it are parked under the same
   *  key, so switching conversations never sends one chat's picks with
   *  another's words. Omit on a composer that never switches. */
  draftKey?: string;
}
