/** Internal scrollable message-list body of ChatPanel. */

import { useEffect, useMemo, useState } from "react";
import {
  Conversation,
  ConversationAutoScroll,
  ConversationContent,
  ConversationScrollButton,
  ConversationTopFade,
} from "./ai-elements/conversation";
import { ConversationLoadOlder } from "./ai-elements/conversation-load-older";
import { Message, MessageContent } from "./ai-elements/message";
import { ChatMessageItem } from "./chat-message-item";
import type { ChatMessagesProps } from "./chat-messages-types";
import {
  getChatDisplayItems,
  shouldShowThinkingIndicator,
} from "./chat-process-groups";
import { ConversationMap } from "./conversation-map";
import { deriveConversationMoments } from "./conversation-map-model";
import { distinctAuthorCount } from "./feed-to-messages";
import { computeTurnEndSummary } from "./turn-tools";

export type { ChatAuthorLabels } from "./author-label";
export { authorLabelFor, senderNameFor } from "./author-label";
export type { ChatMessagesProps } from "./chat-messages-types";

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
  onLoadOlder,
  hasOlderMessages,
  onOpenLink,
  renderLink,
  currentUserId,
  authorLabels,
  showSenders,
  agentLabel,
  renderSenderAvatar,
  mentionPeople,
  conversationMap,
}: ChatMessagesProps) {
  const [highlightedMessageKey, setHighlightedMessageKey] = useState<
    string | null
  >(null);
  // A shared conversation attributes EVERY turn (`showSenders`) — sender
  // identity is a property of the deployment, not of how many people have
  // written. Without that signal, fall back to the historical heuristic: label
  // user bubbles only once the thread holds ≥2 distinct authors (C5), and never
  // label the agent.
  const showAuthorLabels = useMemo(
    () => showSenders ?? distinctAuthorCount(messages) >= 2,
    [showSenders, messages],
  );
  const turnEndSummaries = useMemo(
    () => computeTurnEndSummary(messages, status),
    [messages, status],
  );
  const displayItems = useMemo(
    () => getChatDisplayItems(messages, status),
    [messages, status],
  );
  const moments = useMemo(
    () => deriveConversationMoments(messages),
    [messages],
  );

  useEffect(() => {
    if (!highlightedMessageKey) return;
    const timeout = window.setTimeout(
      () => setHighlightedMessageKey(null),
      1600,
    );
    return () => window.clearTimeout(timeout);
  }, [highlightedMessageKey]);

  // HOU-471: show the standalone thinking indicator only when no active process
  // block is already surfacing progress (see the helper) — otherwise the two
  // would duplicate while the agent runs tools.
  const showThinkingIndicator = shouldShowThinkingIndicator(
    displayItems,
    status,
  );

  return (
    <Conversation className="flex-1 min-h-0">
      <ConversationAutoScroll status={status} />
      <ConversationTopFade />
      <ConversationContent className="max-w-3xl mx-auto">
        {onLoadOlder ? (
          <ConversationLoadOlder
            hasOlder={hasOlderMessages === true}
            onLoadOlder={onLoadOlder}
          />
        ) : null}
        {displayItems.map((item) => (
          <ChatMessageItem
            agentLabel={agentLabel}
            authorLabels={authorLabels}
            contextCompactedLabel={contextCompactedLabel}
            currentUserId={currentUserId}
            forcedSenders={showSenders === true}
            getThinkingMessage={getThinkingMessage}
            highlightedMessageKey={highlightedMessageKey}
            isSpecialTool={isSpecialTool}
            item={item}
            key={item.kind === "process" ? item.key : item.message.key}
            mentionPeople={mentionPeople}
            messageCount={messages.length}
            onOpenLink={onOpenLink}
            processLabels={processLabels}
            renderLink={renderLink}
            renderMessageAvatar={renderMessageAvatar}
            renderSenderAvatar={renderSenderAvatar}
            renderSystemMessage={renderSystemMessage}
            renderToolResult={renderToolResult}
            renderTurnSummary={renderTurnSummary}
            renderUserMessage={renderUserMessage}
            selectedLabel={conversationMap?.labels?.selected}
            showAuthorLabels={showAuthorLabels}
            toolLabels={toolLabels}
            transformContent={transformContent}
            turnEndSummaries={turnEndSummaries}
          />
        ))}
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
      <ConversationMap
        conversationLength={messages.length}
        labels={conversationMap?.labels}
        moments={moments}
        onBackToLatest={conversationMap?.onBackToLatest}
        onMomentClick={conversationMap?.onMomentClick}
        onMomentHighlight={setHighlightedMessageKey}
        onOpenChange={conversationMap?.onOpenChange}
      />
      <ConversationScrollButton />
    </Conversation>
  );
}
