import type { ReactNode } from "react";
import type { ToolsAndCardsProps } from "./chat-helpers";
import type { ChatMessagesProps } from "./chat-messages-types";
import type { DictationControl } from "./dictation-types";
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
  /** Indicator for the gap before the agent's first output (the message is
   *  in flight but nothing is running yet — e.g. the pulsing Houston helmet).
   *  Suppressed the moment an active mission-log header takes over with
   *  "Mission in progress: <action>" (HOU-724). */
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
  /** Localized label for the context-compaction divider. English default in
   *  the component; the app passes a `t()` string. */
  contextCompactedLabel?: string;
  renderUserMessage?: (msg: ChatMessage) => ReactNode | undefined;
  afterMessages?: ReactNode;
  renderTurnSummary?: ChatMessagesProps["renderTurnSummary"];
  onOpenLink?: (url: string) => void;
  renderLink?: ChatMessagesProps["renderLink"];
  /** Locks the composer: the textarea, attach, and submit controls all go
   *  inert and dimmed, so no message can be typed or sent while it is set.
   *  Generic — the consumer decides when an interaction owns the turn. */
  composerDisabled?: boolean;
  composerOverride?: ReactNode;
  /** How `composerOverride` composes with the input. `"above"` (default) keeps
   *  the input usable below the card so typing abandons the pending
   *  interaction; `"replace"` hides the input entirely while the override is
   *  present — for surfaces whose override is the ONLY intended action. */
  composerOverrideMode?: "above" | "replace";
  composerLabels?: ChatComposerLabels;
  /** Prop-driven dictation control for the composer. Omit to hide the mic
   *  affordance entirely (e.g. the web build with no speech capture). */
  dictation?: DictationControl;
  /**
   * Multiplayer only (C5): the signed-in viewer's user id, so the panel can tell
   * the viewer's own bubbles from teammates'. Absent in single-player mode.
   */
  currentUserId?: ChatMessagesProps["currentUserId"];
  /** Localized author-attribution labels. See `ChatAuthorLabels`. */
  authorLabels?: ChatMessagesProps["authorLabels"];
  /** Props-only configuration for the optional Conversation Map. */
  conversationMap?: ChatMessagesProps["conversationMap"];
}
