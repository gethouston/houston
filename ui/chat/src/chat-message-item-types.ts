/**
 * The prop contract of one rendered conversation row. Split out of
 * `chat-message-item.tsx` so that file stays the row composer and keeps to the
 * 200-line budget, following the same convention as `chat-messages-types.ts`
 * and `chat-panel-types.ts`.
 */

import type { ReactNode } from "react";
import type { RenderLinkProps } from "./ai-elements/message";
import type { ReasoningTriggerProps } from "./ai-elements/reasoning";
import type { ChatAuthorLabels } from "./author-label";
import type { ToolsAndCardsProps } from "./chat-helpers";
import type { ChatMessagesProps } from "./chat-messages-types";
import type { ChatProcessLabels } from "./chat-process-block";
import type { ChatDisplayItem } from "./chat-process-groups";
import type { ChatMessage } from "./feed-to-messages";
import type { TurnEndSummary } from "./turn-tools";

export interface ChatMessageItemProps {
  item: ChatDisplayItem;
  messageCount: number;
  turnEndSummaries: Map<number, TurnEndSummary>;
  highlightedMessageKey: string | null;
  selectedLabel?: string;
  /** User rows are attributed (forced by `showSenders`, else the ≥2-author
   *  heuristic). */
  showAuthorLabels: boolean;
  /** Attribution is FORCED on (a shared conversation): agent rows carry the
   *  agent's sender line too. False = the legacy ≥2-author heuristic, which
   *  attributes user rows only. */
  forcedSenders: boolean;
  /** This row OPENS a run from its sender, so it prints the name and the face;
   *  later rows of the same run render bare. See `chat-sender-runs.ts`. */
  isRunStart: boolean;
  /** The agent's display name for its sender line. */
  agentLabel?: string;
  renderSenderAvatar?: (msg: ChatMessage) => ReactNode | undefined;
  senderNameClass?: ChatMessagesProps["senderNameClass"];
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
  renderSystemMessage?: (msg: ChatMessage) => ReactNode | undefined;
  contextCompactedLabel?: string;
  renderUserMessage?: (msg: ChatMessage) => ReactNode | undefined;
  /** Edit-and-resend (PRODUCT-1217): the user asked to edit this previous user
   *  message. Present = the affordance renders on the viewer's own settled
   *  user rows that carry a `turnId`; the consumer rewinds + resends. */
  onEditMessage?: (msg: ChatMessage) => void;
  /** Consumer gate on top of the built-in ones (e.g. skill/attachment marker
   *  messages are not editable). Absent = every eligible row is editable. */
  canEditMessage?: (msg: ChatMessage) => boolean;
  /** Localized label + tooltip for the edit affordance. English default. */
  editMessageLabel?: string;
  /** Copy-message affordance on settled user AND agent rows (PRODUCT-1217
   *  follow-up). Off by default so existing consumers are unchanged. */
  enableMessageCopy?: boolean;
  /** Consumer gate on top of the built-in ones (e.g. marker-encoded rows whose
   *  raw content is not what the bubble shows). Absent = every settled,
   *  non-empty row is copyable. */
  canCopyMessage?: (msg: ChatMessage) => boolean;
  /** Localized label + tooltip for the copy affordance. English default. */
  copyMessageLabel?: string;
  onOpenLink?: (url: string) => void;
  renderLink?: (props: RenderLinkProps) => ReactNode;
  currentUserId?: string;
  authorLabels?: ChatAuthorLabels;
  /** Roster an assistant reply's "@Name" runs are chipped against (HOU-944). */
  mentionPeople?: ChatMessagesProps["mentionPeople"];
}
