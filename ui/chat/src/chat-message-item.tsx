import type { ReactNode } from "react";
import type { RenderLinkProps } from "./ai-elements/message";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "./ai-elements/message";
import type { ReasoningTriggerProps } from "./ai-elements/reasoning";
import type { ChatAuthorLabels } from "./author-label";
import { authorLabelFor } from "./author-label";
import type { ToolsAndCardsProps } from "./chat-helpers";
import type { ChatProcessLabels } from "./chat-process-block";
import type { ChatDisplayItem } from "./chat-process-groups";
import { ChatProcessMessage } from "./chat-process-message";
import { ChatSystemMessage } from "./chat-system-message";
import type { ChatMessage } from "./feed-to-messages";
import type { TurnEndSummary } from "./turn-tools";

interface ChatMessageItemProps {
  item: ChatDisplayItem;
  messageCount: number;
  turnEndSummaries: Map<number, TurnEndSummary>;
  highlightedMessageKey: string | null;
  selectedLabel?: string;
  showAuthorLabels: boolean;
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
}

export function ChatMessageItem({
  item,
  messageCount,
  turnEndSummaries,
  highlightedMessageKey,
  selectedLabel,
  showAuthorLabels,
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
}: ChatMessageItemProps) {
  if (item.kind === "process") {
    return (
      <ChatProcessMessage
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
    className: highlighted
      ? "rounded-xl bg-accent/70 px-2 py-1 outline outline-2 outline-ring"
      : undefined,
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

  const authorLabel =
    message.from === "user" && showAuthorLabels
      ? authorLabelFor(message.author, currentUserId, authorLabels)
      : null;
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
        {authorLabel ? (
          <div className="mb-1 px-1 text-xs text-ink-muted group-[.is-user]:text-right">
            {authorLabel}
          </div>
        ) : null}
        <ChatMessageBody
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

interface ChatMessageBodyProps {
  message: ChatMessage;
  streaming: boolean;
  transformContent?: ChatMessageItemProps["transformContent"];
  renderUserMessage?: ChatMessageItemProps["renderUserMessage"];
  onOpenLink?: (url: string) => void;
  renderLink?: (props: RenderLinkProps) => ReactNode;
}

function ChatMessageBody({
  message,
  streaming,
  transformContent,
  renderUserMessage,
  onOpenLink,
  renderLink,
}: ChatMessageBodyProps) {
  if (!message.content) return null;
  if (message.from === "user" && renderUserMessage) {
    const custom = renderUserMessage(message);
    if (custom !== undefined) return custom;
  }
  const transformed =
    message.from === "assistant" && transformContent
      ? transformContent(message.content)
      : null;

  return (
    <MessageContent>
      <MessageResponse
        isAnimating={streaming}
        onOpenLink={onOpenLink}
        renderLink={renderLink}
      >
        {transformed?.content ?? message.content}
      </MessageResponse>
      {transformed?.extra}
    </MessageContent>
  );
}
