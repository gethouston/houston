import type { ReactNode, RefObject } from "react";
import type { RenderLinkProps } from "./ai-elements/message";
import type { ReasoningTriggerProps } from "./ai-elements/reasoning";
import type { ChatAuthorLabels } from "./author-label";
import type { ToolsAndCardsProps } from "./chat-helpers";
import type { ChatMessageItemProps } from "./chat-message-item-types";
import type { ChatProcessLabels } from "./chat-process-block";
import type { ConversationMapLabels } from "./conversation-map";
import type { ConversationMoment } from "./conversation-map-model";
import type { ChatMessage } from "./feed-to-messages";
import type { TurnEndSummary } from "./turn-tools";
import type { MentionPerson } from "./types";

export interface ChatMessagesProps {
  messages: ChatMessage[];
  status: "ready" | "streaming" | "submitted";
  /** Shown while a turn is `"submitted"` and no active mission-log header is
   *  on screen yet — the pre-first-output loading gap. Once the agent is
   *  actually working, the active process block's "Thinking..." / current-step
   *  line is the only indicator (HOU-724). */
  thinkingIndicator: ReactNode;
  transformContent?: (content: string) => {
    content: string;
    extra?: ReactNode;
  };
  toolLabels?: ToolsAndCardsProps["toolLabels"];
  isSpecialTool?: ToolsAndCardsProps["isSpecialTool"];
  renderToolResult?: ToolsAndCardsProps["renderToolResult"];
  processLabels?: ChatProcessLabels;
  getThinkingMessage?: ReasoningTriggerProps["getThinkingMessage"];
  renderMessageAvatar?: (msg: ChatMessage) => ReactNode | undefined;
  renderTurnSummary?: (summary: TurnEndSummary) => ReactNode;
  /** Custom renderer for system messages. Return a node to replace the default,
   *  or undefined to use the default italic text. */
  renderSystemMessage?: (msg: ChatMessage) => ReactNode | undefined;
  /** Localized label for the context-compaction divider. The library ships an
   *  English default; the app passes a `t()` string (i18n stays out of `ui/`). */
  contextCompactedLabel?: string;
  /**
   * Custom renderer for user messages. Return a node to replace the
   * default user bubble (e.g. to render a structured action-invocation
   * card), or `undefined` to fall through to the default markdown body.
   * The `Message` wrapper still renders around the returned node so
   * speaker attribution stays consistent.
   */
  renderUserMessage?: (msg: ChatMessage) => ReactNode | undefined;
  /** Edit-and-resend (PRODUCT-1217): see `ChatMessageItemProps.onEditMessage`. */
  onEditMessage?: (msg: ChatMessage) => void;
  /** See `ChatMessageItemProps.canEditMessage`. */
  canEditMessage?: (msg: ChatMessage) => boolean;
  /** See `ChatMessageItemProps.editMessageLabel`. */
  editMessageLabel?: string;
  /** Copy-message affordance: see `ChatMessageItemProps.enableMessageCopy`. */
  enableMessageCopy?: boolean;
  /** See `ChatMessageItemProps.canCopyMessage`. */
  canCopyMessage?: (msg: ChatMessage) => boolean;
  /** See `ChatMessageItemProps.copyMessageLabel`. */
  copyMessageLabel?: string;
  /** In-place editing: see `ChatMessageItemProps.messageEditing`. */
  messageEditing?: ChatMessageItemProps["messageEditing"];
  /** Node rendered after the last message (inside the scroll container).
   *  Useful for inline end-of-feed cards like auth reconnect prompts. */
  afterMessages?: ReactNode;
  /** Scroll-up lazy-load (HOU-819): prepend the previous transcript page.
   *  Rendered as a top-of-feed trigger only when `hasOlderMessages`. */
  onLoadOlder?: () => Promise<unknown>;
  /** Older messages exist beyond the loaded window (the trigger shows). */
  hasOlderMessages?: boolean;
  onOpenLink?: (url: string) => void;
  /** Custom renderer for markdown links. See `RenderLinkProps`. */
  renderLink?: (props: RenderLinkProps) => ReactNode;
  /**
   * Multiplayer only (C5): the signed-in viewer's user id. Decides whether a
   * user bubble is the viewer's OWN — own bubbles stay right-aligned with no
   * face and no name, a teammate's mirrors to the left. Absent (single-player,
   * or the identity has not resolved yet) treats every row as the viewer's,
   * which is exactly the single-player layout.
   */
  currentUserId?: string;
  /** Localized labels for author attribution. See `ChatAuthorLabels`. */
  authorLabels?: ChatAuthorLabels;
  /**
   * Force sender identity onto EVERY turn: a teammate's row mirrors to the left
   * with their face beside it and their name as the bubble's first line, and
   * each assistant row carries the agent's mark + name. Set it when the
   * conversation is shared (a multiplayer deployment) — attribution is a
   * property of the deployment, not of how many people have written yet.
   *
   * Omitted (the default) keeps the historical heuristic: user rows are
   * attributed only once the thread holds ≥2 distinct authors, and assistant
   * rows never are.
   *
   * Either way the VIEWER's own rows show no face and no name: a group chat
   * identifies you by which side your bubble is on.
   */
  showSenders?: boolean;
  /** The agent's display name, shown on assistant rows when `showSenders`.
   *  Without it an assistant row shows its mark only. */
  agentLabel?: string;
  /** The sender avatar for a row (teammate face / agent mark). Rendered only on
   *  the FIRST row of a run from that sender; the column stays reserved on the
   *  rest so the bubbles line up. Distinct from `renderMessageAvatar`, which
   *  badges the bubble itself (channel logos). */
  renderSenderAvatar?: (msg: ChatMessage) => ReactNode | undefined;
  /**
   * The Tailwind text-colour utility a row's sender NAME is painted in — a
   * teammate's stable person tone, the agent's own avatar colour. Same seam as
   * `renderSenderAvatar`: sender presentation comes from the consumer, which is
   * the only side that knows the palette, the profile, and the agent. Absent
   * (or `undefined` for a row) paints the name in plain ink.
   */
  senderNameClass?: (msg: ChatMessage) => string | undefined;
  /**
   * Multiplayer only (HOU-944): the space roster an ASSISTANT reply's "@Name"
   * runs are chipped against. A user message chips off its OWN recorded
   * mentions, so it needs no roster. Include the viewer, so "@Julian" in an
   * agent reply still chips for Julian. Empty/absent renders no chips.
   */
  mentionPeople?: readonly MentionPerson[];
  /** Props-only configuration for the optional Conversation Map. */
  conversationMap?: {
    labels?: ConversationMapLabels;
    /** Increment to open the chat search (the header menu's "Find"). */
    findToken?: number;
    /** The header trigger; the search returns focus there when it closes. */
    returnFocusRef?: RefObject<HTMLButtonElement | null>;
    onOpenChange?: (open: boolean, conversationLength: number) => void;
    onMomentClick?: (
      moment: ConversationMoment,
      conversationLength: number,
    ) => void;
    onBackToLatest?: (conversationLength: number) => void;
  };
}
