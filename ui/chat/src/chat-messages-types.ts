import type { ReactNode } from "react";
import type { RenderLinkProps } from "./ai-elements/message";
import type { ReasoningTriggerProps } from "./ai-elements/reasoning";
import type { ChatAuthorLabels } from "./author-label";
import type { ToolsAndCardsProps } from "./chat-helpers";
import type { ChatProcessLabels } from "./chat-process-block";
import type { ConversationMapLabels } from "./conversation-map";
import type { ConversationMoment } from "./conversation-map-model";
import type { ChatMessage } from "./feed-to-messages";
import type { TurnEndSummary } from "./turn-tools";

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
   * Multiplayer only (C5): the signed-in viewer's user id. Used to decide
   * whether a user bubble is the viewer's own — its author label is hidden
   * (or shows `authorLabels.you` when provided). Absent in single-player mode.
   */
  currentUserId?: string;
  /** Localized labels for author attribution. See `ChatAuthorLabels`. */
  authorLabels?: ChatAuthorLabels;
  /** Props-only configuration for the optional Conversation Map. */
  conversationMap?: {
    labels?: ConversationMapLabels;
    onOpenChange?: (open: boolean, conversationLength: number) => void;
    onMomentClick?: (
      moment: ConversationMoment,
      conversationLength: number,
    ) => void;
    onBackToLatest?: (conversationLength: number) => void;
  };
}
