import { ChatMessages } from "./chat-messages";
import type { ChatPanelProps, ChatStatus } from "./chat-panel-types";
import { ChatThinkingIndicator } from "./chat-thinking-indicator";
import type { ChatMessage } from "./feed-to-messages";

const DefaultThinkingIndicator = () => <ChatThinkingIndicator />;

export type ChatPanelLogProps = Omit<ChatPanelProps, "status"> & {
  messages: ChatMessage[];
  status: ChatStatus;
};

export function ChatPanelLog({
  sessionKey,
  messages,
  status,
  emptyState,
  thinkingIndicator,
  transformContent,
  toolLabels,
  isSpecialTool,
  renderToolResult,
  processLabels,
  getThinkingMessage,
  renderMessageAvatar,
  renderSystemMessage,
  contextCompactedLabel,
  renderUserMessage,
  onEditMessage,
  canEditMessage,
  editMessageLabel,
  enableMessageCopy,
  canCopyMessage,
  copyMessageLabel,
  messageEditing,
  afterMessages,
  onLoadOlder,
  hasOlderMessages,
  renderTurnSummary,
  onOpenLink,
  renderLink,
  currentUserId,
  authorLabels,
  showSenders,
  agentLabel,
  renderSenderAvatar,
  senderNameClass,
  mentionPeople,
  messageMentionPeople,
  conversationMap,
  scrollToLatestToken,
}: ChatPanelLogProps) {
  if (messages.length === 0 && status === "ready")
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center">
        {emptyState}
      </div>
    );

  return (
    <ChatMessages
      key={sessionKey}
      messages={messages}
      status={status}
      thinkingIndicator={thinkingIndicator ?? <DefaultThinkingIndicator />}
      transformContent={transformContent}
      toolLabels={toolLabels}
      isSpecialTool={isSpecialTool}
      renderToolResult={renderToolResult}
      processLabels={processLabels}
      getThinkingMessage={getThinkingMessage}
      renderMessageAvatar={renderMessageAvatar}
      renderSystemMessage={renderSystemMessage}
      contextCompactedLabel={contextCompactedLabel}
      renderUserMessage={renderUserMessage}
      onEditMessage={onEditMessage}
      canEditMessage={canEditMessage}
      editMessageLabel={editMessageLabel}
      enableMessageCopy={enableMessageCopy}
      canCopyMessage={canCopyMessage}
      copyMessageLabel={copyMessageLabel}
      messageEditing={messageEditing}
      afterMessages={afterMessages}
      onLoadOlder={onLoadOlder}
      hasOlderMessages={hasOlderMessages}
      renderTurnSummary={renderTurnSummary}
      onOpenLink={onOpenLink}
      renderLink={renderLink}
      currentUserId={currentUserId}
      authorLabels={authorLabels}
      showSenders={showSenders}
      agentLabel={agentLabel}
      renderSenderAvatar={renderSenderAvatar}
      senderNameClass={senderNameClass}
      mentionPeople={messageMentionPeople ?? mentionPeople}
      conversationMap={conversationMap}
      scrollToLatestToken={scrollToLatestToken}
    />
  );
}
