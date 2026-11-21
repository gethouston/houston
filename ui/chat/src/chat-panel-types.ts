import type { ReactNode } from "react";
import type { ToolsAndCardsProps } from "./chat-helpers";
import type { ChatMessagesProps } from "./chat-messages-types";
import type { DictationControl } from "./dictation-types";
import type { ChatMessage } from "./feed-to-messages";
import type {
  QueuedChatMessage,
  QueuedMessageLabels,
} from "./queued-message-list";
import type { FeedItem, MentionPerson, MessageMention } from "./types";
import type { ComposerDraftStore } from "./use-composer-draft";

export type ChatStatus = "ready" | "streaming" | "submitted";

export interface AttachmentRejection {
  file: File;
  reason: string;
}

export interface PreparedAttachments {
  accepted: File[];
  rejected: AttachmentRejection[];
}

export type PrepareAttachments = (
  incoming: File[],
  existing: File[],
) => PreparedAttachments;

export interface ChatComposerLabels {
  fileAlreadyInChat?: string;
  dropTitle?: string;
  dropDescription?: string;
  imagePasteUnavailable?: string;
  tooManyFiles?: string;
  folderReadFailed?: string;
  folderFileCount?: (count: number) => string;
  submit?: string;
  stop?: string;
  attachFiles?: string;
  resizeComposer?: string;
  removeAttachment?: (name: string) => string;
}

export interface ChatPanelProps {
  sessionKey: string;
  feedItems: FeedItem[];
  onSend: (
    text: string,
    files: File[],
    mentions: MessageMention[],
  ) => void | Promise<void>;
  onStop?: () => void;
  onBack?: () => void;
  isLoading: boolean;
  placeholder?: string;
  emptyState?: ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
  draftStore?: ComposerDraftStore;
  composerFocusToken?: number;
  scrollToLatestToken?: ChatMessagesProps["scrollToLatestToken"];
  attachments?: File[];
  onAttachmentsChange?: (files: File[]) => void;
  onNotice?: (message: string) => void;
  prepareAttachments?: PrepareAttachments;
  onAttachmentRejections?: (rejections: AttachmentRejection[]) => void;
  footer?: ReactNode;
  composerHeader?: ReactNode;
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
  status?: ChatStatus;
  thinkingIndicator?: ReactNode;
  transformContent?: (content: string) => {
    content: string;
    extra?: ReactNode;
  };
  toolLabels?: ToolsAndCardsProps["toolLabels"];
  isSpecialTool?: ToolsAndCardsProps["isSpecialTool"];
  renderToolResult?: ToolsAndCardsProps["renderToolResult"];
  processLabels?: ChatMessagesProps["processLabels"];
  getThinkingMessage?: ChatMessagesProps["getThinkingMessage"];
  renderMessageAvatar?: (msg: ChatMessage) => ReactNode | undefined;
  renderSystemMessage?: (msg: ChatMessage) => ReactNode | undefined;
  contextCompactedLabel?: string;
  renderUserMessage?: (msg: ChatMessage) => ReactNode | undefined;
  onEditMessage?: ChatMessagesProps["onEditMessage"];
  canEditMessage?: ChatMessagesProps["canEditMessage"];
  editMessageLabel?: ChatMessagesProps["editMessageLabel"];
  enableMessageCopy?: ChatMessagesProps["enableMessageCopy"];
  canCopyMessage?: ChatMessagesProps["canCopyMessage"];
  copyMessageLabel?: ChatMessagesProps["copyMessageLabel"];
  messageEditing?: ChatMessagesProps["messageEditing"];
  afterMessages?: ReactNode;
  onLoadOlder?: ChatMessagesProps["onLoadOlder"];
  hasOlderMessages?: ChatMessagesProps["hasOlderMessages"];
  renderTurnSummary?: ChatMessagesProps["renderTurnSummary"];
  onOpenLink?: (url: string) => void;
  renderLink?: ChatMessagesProps["renderLink"];
  composerDisabled?: boolean;
  composerOverride?: ReactNode;
  composerOverrideMode?: "above" | "replace";
  composerLabels?: ChatComposerLabels;
  dictation?: DictationControl;
  currentUserId?: ChatMessagesProps["currentUserId"];
  authorLabels?: ChatMessagesProps["authorLabels"];
  showSenders?: ChatMessagesProps["showSenders"];
  agentLabel?: ChatMessagesProps["agentLabel"];
  renderSenderAvatar?: ChatMessagesProps["renderSenderAvatar"];
  senderNameClass?: ChatMessagesProps["senderNameClass"];
  mentionPeople?: readonly MentionPerson[];
  messageMentionPeople?: ChatMessagesProps["mentionPeople"];
  renderMentionAvatar?: (person: MentionPerson) => ReactNode;
  mentionLabels?: { listAriaLabel?: string };
  conversationMap?: ChatMessagesProps["conversationMap"];
}
