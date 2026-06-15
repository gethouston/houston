/**
 * Internal: the scrollable message list body of ChatPanel.
 * Extracted so chat-panel.tsx stays under the 200-line budget.
 * Not exported from the package index.
 */

import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  Conversation,
  ConversationAutoScroll,
  ConversationContent,
  ConversationScrollButton,
} from "./ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "./ai-elements/message";
import type { RenderLinkProps } from "./ai-elements/message";
import type { ReasoningTriggerProps } from "./ai-elements/reasoning";
import type { ToolsAndCardsProps } from "./chat-helpers";
import { ChatProcessBlock } from "./chat-process-block";
import type { ChatProcessLabels } from "./chat-process-block";
import { getChatDisplayItems, shouldShowThinkingIndicator } from "./chat-process-groups";
import { computeTurnEndSummary } from "./turn-tools";
import type { TurnEndSummary } from "./turn-tools";
import type { ChatMessage } from "./feed-to-messages";

export interface ChatMessagesProps {
  messages: ChatMessage[];
  status: "ready" | "streaming" | "submitted";
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
  onOpenLink?: (url: string) => void;
  /** Custom renderer for markdown links. See `RenderLinkProps`. */
  renderLink?: (props: RenderLinkProps) => ReactNode;
}

export function ChatMessages({
  messages,
  status,
  thinkingIndicator,
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
  afterMessages,
  onOpenLink,
  renderLink,
}: ChatMessagesProps) {
  const turnEndSummaries = useMemo(
    () => computeTurnEndSummary(messages, status),
    [messages, status],
  );
  const displayItems = useMemo(
    () => getChatDisplayItems(messages, status),
    [messages, status],
  );
  // HOU-471: show the standalone "Mission in progress..." line only when no
  // active process block is already surfacing it (see the helper) — otherwise
  // the two would duplicate while the agent runs tools.
  const showThinkingIndicator = shouldShowThinkingIndicator(displayItems, status);
  return (
    <Conversation className="flex-1 min-h-0">
      <ConversationAutoScroll status={status} />
      <ConversationContent className="max-w-3xl mx-auto">
        {displayItems.map((item) => {
          if (item.kind === "process") {
            return (
              <Message
                from="assistant"
                key={item.key}
                className="-my-6"
                avatar={renderMessageAvatar?.(item.segments[0].message)}
              >
                <div>
                  <ChatProcessBlock
                    segments={item.segments}
                    isActive={item.isActive}
                    labels={processLabels}
                    toolLabels={toolLabels}
                    isSpecialTool={isSpecialTool}
                    renderToolResult={renderToolResult}
                    getThinkingMessage={getThinkingMessage}
                  />
                  {(() => {
                    if (!item.isTrailing || item.isActive || !renderTurnSummary) return null;
                    const summary = turnEndSummaries.get(item.sourceIndex);
                    if (!summary) return null;
                    return renderTurnSummary(summary);
                  })()}
                </div>
              </Message>
            );
          }

          const msg = item.message;
          const idx = item.sourceIndex;
          if (msg.from === "system") {
            const custom = renderSystemMessage?.(msg);
            if (custom !== undefined) return <div key={msg.key}>{custom}</div>;
            if (msg.compaction) {
              return (
                <div
                  key={msg.key}
                  className="flex items-center gap-3 max-w-3xl mx-auto px-4 py-3 text-muted-foreground/70"
                >
                  <div className="h-px flex-1 bg-border/60" />
                  <span className="text-xs italic whitespace-nowrap">
                    {contextCompactedLabel ??
                      "Earlier conversation summarized to free up space"}
                  </span>
                  <div className="h-px flex-1 bg-border/60" />
                </div>
              );
            }
            return (
              <div key={msg.key} className="flex justify-center py-2">
                <span className="text-xs text-muted-foreground/60 italic">
                  {msg.content}
                </span>
              </div>
            );
          }
          const isLastMsg = idx === messages.length - 1;
          const streaming = msg.isStreaming && isLastMsg;
          return (
            <Message from={msg.from} key={msg.key} avatar={renderMessageAvatar?.(msg)}>
              <div>
                {msg.content && (() => {
                  if (msg.from === "user" && renderUserMessage) {
                    const custom = renderUserMessage(msg);
                    if (custom !== undefined) return custom;
                  }
                  const transformed = msg.from === "assistant" && transformContent
                    ? transformContent(msg.content)
                    : null;
                  const displayContent = transformed?.content ?? msg.content;
                  return (
                    <MessageContent>
                      <MessageResponse
                        isAnimating={streaming}
                        onOpenLink={onOpenLink}
                        renderLink={renderLink}
                      >
                        {displayContent}
                      </MessageResponse>
                      {transformed?.extra}
                    </MessageContent>
                  );
                })()}
                {(() => {
                  if (!renderTurnSummary) return null;
                  const summary = turnEndSummaries.get(idx);
                  if (!summary) return null;
                  return renderTurnSummary(summary);
                })()}
              </div>
            </Message>
          );
        })}
        {showThinkingIndicator && (
          <Message from="assistant">
            <MessageContent>
              {thinkingIndicator}
            </MessageContent>
          </Message>
        )}
        {afterMessages}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
