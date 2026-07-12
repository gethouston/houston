/**
 * Internal: the scrollable message list body of ChatPanel.
 * Extracted so chat-panel.tsx stays under the 200-line budget.
 * Not exported from the package index.
 */

import type { ReactNode } from "react";
import { useMemo } from "react";
import {
  Conversation,
  ConversationAutoScroll,
  ConversationContent,
  ConversationScrollButton,
  ConversationTopFade,
} from "./ai-elements/conversation";
import type { RenderLinkProps } from "./ai-elements/message";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "./ai-elements/message";
import type { ReasoningTriggerProps } from "./ai-elements/reasoning";
import { authorLabelFor, type ChatAuthorLabels } from "./author-label";
import type { ToolsAndCardsProps } from "./chat-helpers";
import type { ChatProcessLabels } from "./chat-process-block";
import {
  getChatDisplayItems,
  shouldShowThinkingIndicator,
} from "./chat-process-groups";
import { ChatProcessMessage } from "./chat-process-message";
import { ChatSystemMessage } from "./chat-system-message";
import type { ChatMessage } from "./feed-to-messages";
import { distinctAuthorCount } from "./feed-to-messages";
import type { TurnEndSummary } from "./turn-tools";
import { computeTurnEndSummary } from "./turn-tools";

export type { ChatAuthorLabels } from "./author-label";
export { authorLabelFor } from "./author-label";

export interface ChatMessagesProps {
  messages: ChatMessage[];
  status: "ready" | "streaming" | "submitted";
  /** Shown while a turn is `"submitted"` and no active mission-log header is
   *  on screen yet — the pre-first-output loading gap. Once the agent is
   *  actually working, the active process block's "Mission in progress:
   *  <action>" line is the only indicator (HOU-724). */
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
  /**
   * Multiplayer only (C5): the signed-in viewer's user id. Used to decide
   * whether a user bubble is the viewer's own — its author label is hidden
   * (or shows `authorLabels.you` when provided). Absent in single-player mode.
   */
  currentUserId?: string;
  /** Localized labels for author attribution. See `ChatAuthorLabels`. */
  authorLabels?: ChatAuthorLabels;
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
  currentUserId,
  authorLabels,
}: ChatMessagesProps) {
  // Show author labels only when the thread has ≥2 distinct authors (C5); a
  // single-author (or single-player) conversation stays label-free.
  const showAuthorLabels = useMemo(
    () => distinctAuthorCount(messages) >= 2,
    [messages],
  );
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
  const showThinkingIndicator = shouldShowThinkingIndicator(
    displayItems,
    status,
  );
  return (
    <Conversation className="flex-1 min-h-0">
      <ConversationAutoScroll status={status} />
      <ConversationTopFade />
      <ConversationContent className="max-w-3xl mx-auto">
        {displayItems.map((item) => {
          if (item.kind === "process") {
            return (
              <ChatProcessMessage
                key={item.key}
                item={item}
                turnEndSummaries={turnEndSummaries}
                renderMessageAvatar={renderMessageAvatar}
                renderTurnSummary={renderTurnSummary}
                processLabels={processLabels}
                toolLabels={toolLabels}
                isSpecialTool={isSpecialTool}
                renderToolResult={renderToolResult}
                getThinkingMessage={getThinkingMessage}
              />
            );
          }

          const msg = item.message;
          const idx = item.sourceIndex;
          if (msg.from === "system") {
            return (
              <ChatSystemMessage
                key={msg.key}
                message={msg}
                renderSystemMessage={renderSystemMessage}
                contextCompactedLabel={contextCompactedLabel}
              />
            );
          }
          const isLastMsg = idx === messages.length - 1;
          const streaming = msg.isStreaming && isLastMsg;
          const authorLabel =
            msg.from === "user" && showAuthorLabels
              ? authorLabelFor(msg.author, currentUserId, authorLabels)
              : null;
          return (
            <Message
              from={msg.from}
              key={msg.key}
              avatar={renderMessageAvatar?.(msg)}
            >
              <div>
                {authorLabel ? (
                  <div className="mb-1 px-1 text-xs text-ink-muted group-[.is-user]:text-right">
                    {authorLabel}
                  </div>
                ) : null}
                {msg.content &&
                  (() => {
                    if (msg.from === "user" && renderUserMessage) {
                      const custom = renderUserMessage(msg);
                      if (custom !== undefined) return custom;
                    }
                    const transformed =
                      msg.from === "assistant" && transformContent
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
        {showThinkingIndicator ? (
          <Message from="assistant">
            <MessageContent>
              <div className="flex flex-col items-start gap-4 py-1">
                {thinkingIndicator}
              </div>
            </MessageContent>
          </Message>
        ) : null}
        {afterMessages}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
