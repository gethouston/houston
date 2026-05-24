import type { ReactNode } from "react";
import type { ToolsAndCardsProps } from "./chat-helpers";
import type { ChatMessagesProps } from "./chat-messages";
import type { ChatMessage } from "./feed-to-messages";
import type {
  QueuedChatMessage,
  QueuedMessageLabels,
} from "./queued-message-list";
import type { FeedItem } from "./types";

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

/** Translated strings the composer surfaces to the user. English defaults
 *  live in the components; the app passes `t()` results in. */
export interface ChatComposerLabels {
  fileAlreadyInChat?: string;
  dropTitle?: string;
  dropDescription?: string;
  /** Shown when an image was on the clipboard but the webview never
   *  handed over the bytes (Linux Wayland WebKitGTK). */
  imagePasteUnavailable?: string;
}

export interface ChatPanelProps {
  sessionKey: string;
  feedItems: FeedItem[];
  onSend: (text: string, files: File[]) => void | Promise<void>;
  onStop?: () => void;
  onBack?: () => void;
  isLoading: boolean;
  placeholder?: string;
  emptyState?: ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
  /** Increment/change this value to focus the composer textarea. */
  composerFocusToken?: number;
  attachments?: File[];
  onAttachmentsChange?: (files: File[]) => void;
  onNotice?: (message: string) => void;
  prepareAttachments?: PrepareAttachments;
  onAttachmentRejections?: (rejections: AttachmentRejection[]) => void;
  footer?: ReactNode;
  composerHeader?: ReactNode;
  /** Popover menu anchored to the paperclip button. Receives `openFilePicker`
   *  so the menu can trigger the underlying file input. */
  attachMenu?:
    | ReactNode
    | ((api: { openFilePicker: () => void; close: () => void }) => ReactNode);
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
  renderUserMessage?: (msg: ChatMessage) => ReactNode | undefined;
  afterMessages?: ReactNode;
  renderTurnSummary?: ChatMessagesProps["renderTurnSummary"];
  onOpenLink?: (url: string) => void;
  renderLink?: ChatMessagesProps["renderLink"];
  composerOverride?: ReactNode;
  composerLabels?: ChatComposerLabels;
}
