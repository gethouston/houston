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
import type { ComposerDraftStore } from "./use-composer-draft";

export type InputStatus = "ready" | "streaming" | "submitted";

export interface ChatInputProps {
  value?: string;
  onValueChange?: (value: string) => void;
  attachments?: File[];
  onAttachmentsChange?: (files: File[]) => void;
  onSend: (
    text: string,
    files: File[],
    mentions: MessageMention[],
  ) => void | Promise<void>;
  onStop?: () => void;
  status?: InputStatus;
  placeholder?: string;
  onNotice?: (message: string) => void;
  prepareAttachments?: PrepareAttachments;
  onAttachmentRejections?: (rejections: AttachmentRejection[]) => void;
  footer?: ReactNode;
  header?: ReactNode;
  attachMenu?:
    | ReactNode
    | ((api: {
        openFilePicker: () => void;
        openFolderPicker: () => void;
        close: () => void;
      }) => ReactNode);
  queuedMessages?: QueuedChatMessage[];
  onRemoveQueuedMessage?: (id: string) => void;
  queuedLabels?: QueuedMessageLabels;
  canSendEmpty?: boolean;
  disabled?: boolean;
  labels?: ChatComposerLabels;
  dictation?: DictationControl;
  mentionPeople?: readonly MentionPerson[];
  renderMentionAvatar?: (person: MentionPerson) => ReactNode;
  mentionLabels?: { listAriaLabel?: string };
  draftKey?: string;
  draftStore?: ComposerDraftStore;
}
