import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import type { RenderLinkProps } from "./ai-elements/message";
import { Message } from "./ai-elements/message";
import type { ReasoningTriggerProps } from "./ai-elements/reasoning";
import type { ChatAuthorLabels } from "./author-label";
import { authorLabelFor, senderNameFor } from "./author-label";
import type { ToolsAndCardsProps } from "./chat-helpers";
import { ChatMessageBody } from "./chat-message-body";
import type { ChatMessagesProps } from "./chat-messages-types";
import type { ChatProcessLabels } from "./chat-process-block";
import type { ChatDisplayItem } from "./chat-process-groups";
import { ChatProcessMessage } from "./chat-process-message";
import { ChatSenderHeader } from "./chat-sender-header";
import { ChatSystemMessage } from "./chat-system-message";
import type { ChatMessage } from "./feed-to-messages";
import { OFFSCREEN_RENDER_SKIP } from "./offscreen-render";
import type { TurnEndSummary } from "./turn-tools";

interface ChatMessageItemProps {
  item: ChatDisplayItem;
  messageCount: number;
  turnEndSummaries: Map<number, TurnEndSummary>;
  highlightedMessageKey: string | null;
  selectedLabel?: string;
  /** User rows carry a sender line (forced by `showSenders`, else the ≥2-author
   *  heuristic). */
  showAuthorLabels: boolean;
  /** Attribution is FORCED on (a shared conversation): agent rows carry the
   *  agent's sender line, and a user row never leaves the viewer anonymous.
   *  False = the legacy ≥2-author heuristic, which labels user rows only. */
  forcedSenders: boolean;
  /** The agent's display name for its sender line. */
  agentLabel?: string;
  renderSenderAvatar?: (msg: ChatMessage) => ReactNode | undefined;
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
  onOpenLink?: (url: string) => void;
  renderLink?: (props: RenderLinkProps) => ReactNode;
  currentUserId?: string;
  authorLabels?: ChatAuthorLabels;
  /** Roster an assistant reply's "@Name" runs are chipped against (HOU-944). */
  mentionPeople?: ChatMessagesProps["mentionPeople"];
}

export function ChatMessageItem({
  item,
  messageCount,
  turnEndSummaries,
  highlightedMessageKey,
  selectedLabel,
  showAuthorLabels,
  forcedSenders,
  agentLabel,
  renderSenderAvatar,
  transformContent,
  toolLabels,
  isSpecialTool,
  renderToolResult,
  processLabels,
  getThinkingMessage,
  renderMessageAvatar,
  renderTurnSummary,
  renderSystemMessage,
  contextCompactedLabel,
  renderUserMessage,
  onOpenLink,
  renderLink,
  currentUserId,
  authorLabels,
  mentionPeople,
}: ChatMessageItemProps) {
  if (item.kind === "process") {
    return (
      <ChatProcessMessage
        // An ACTIVE (streaming) block is at the viewport bottom and renders
        // normally either way; settled blocks off-screen skip layout/paint.
        className={OFFSCREEN_RENDER_SKIP}
        getThinkingMessage={getThinkingMessage}
        isSpecialTool={isSpecialTool}
        item={item}
        processLabels={processLabels}
        renderMessageAvatar={renderMessageAvatar}
        renderToolResult={renderToolResult}
        renderTurnSummary={renderTurnSummary}
        toolLabels={toolLabels}
        turnEndSummaries={turnEndSummaries}
      />
    );
  }

  const { message, sourceIndex } = item;
  const highlighted = highlightedMessageKey === message.key;
  const sharedProps = {
    "aria-label": highlighted ? selectedLabel : undefined,
    className: cn(
      OFFSCREEN_RENDER_SKIP,
      highlighted &&
        "rounded-xl bg-accent/70 px-2 py-1 outline outline-2 outline-ring",
    ),
    "data-conversation-message-key": message.key,
  };

  if (message.from === "system") {
    return (
      <div {...sharedProps}>
        <ChatSystemMessage
          contextCompactedLabel={contextCompactedLabel}
          message={message}
          renderSystemMessage={renderSystemMessage}
        />
      </div>
    );
  }

  // Who said this turn. A user row names its author (forced attribution never
  // leaves the viewer anonymous — `senderNameFor`; the legacy heuristic keeps
  // `authorLabelFor`'s "own bubbles stay bare"); an agent row names the agent,
  // and only when attribution is forced on.
  const isUser = message.from === "user";
  const attributed = isUser ? showAuthorLabels : forcedSenders;
  const senderName = !attributed
    ? null
    : !isUser
      ? (agentLabel ?? null)
      : forcedSenders
        ? senderNameFor(message.author, currentUserId, authorLabels)
        : authorLabelFor(message.author, currentUserId, authorLabels);
  const senderAvatar = attributed ? renderSenderAvatar?.(message) : undefined;
  const showSenderLine =
    attributed && (senderName !== null || senderAvatar !== undefined);
  const streaming = message.isStreaming && sourceIndex === messageCount - 1;
  const summary = renderTurnSummary
    ? turnEndSummaries.get(sourceIndex)
    : undefined;

  return (
    <Message
      {...sharedProps}
      avatar={renderMessageAvatar?.(message)}
      from={message.from}
    >
      <div>
        {showSenderLine ? (
          <ChatSenderHeader
            avatar={senderAvatar}
            isUser={isUser}
            name={senderName ?? undefined}
          />
        ) : null}
        <ChatMessageBody
          currentUserId={currentUserId}
          mentionPeople={mentionPeople}
          message={message}
          onOpenLink={onOpenLink}
          renderLink={renderLink}
          renderUserMessage={renderUserMessage}
          streaming={streaming}
          transformContent={transformContent}
        />
        {summary ? renderTurnSummary?.(summary) : null}
      </div>
    </Message>
  );
}
