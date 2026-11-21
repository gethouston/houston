import { cn } from "@houston-ai/core";
import { Message } from "./ai-elements/message";
import {
  announcesSelfAuthorship,
  isPeerRow,
  senderNameFor,
} from "./author-label";
import { ChatMessageActionsRow } from "./chat-message-actions";
import { ChatMessageBody } from "./chat-message-body";
import { ChatMessageEditor } from "./chat-message-editor";
import type { ChatMessageItemProps } from "./chat-message-item-types";
import { ChatProcessMessage } from "./chat-process-message";
import { ChatPeerRow, ChatSenderName } from "./chat-sender-parts";
import { ChatSystemMessage } from "./chat-system-message";
import { OFFSCREEN_RENDER_SKIP } from "./offscreen-render";

export function ChatMessageItem({
  item,
  messageCount,
  turnEndSummaries,
  highlightedMessageKey,
  selectedLabel,
  showAuthorLabels,
  forcedSenders,
  isRunStart,
  agentLabel,
  renderSenderAvatar,
  senderNameClass,
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
  onEditMessage,
  canEditMessage,
  editMessageLabel,
  enableMessageCopy,
  canCopyMessage,
  copyMessageLabel,
  messageEditing,
  onOpenLink,
  renderLink,
  currentUserId,
  authorLabels,
  mentionPeople,
}: ChatMessageItemProps) {
  if (item.kind === "process") {
    return (
      <ChatProcessMessage
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
        "rounded-xl bg-highlight/70 px-2 py-1 outline outline-2 outline-focus",
    ),
    "data-conversation-message-key": message.key,
    tabIndex: -1,
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

  const isUser = message.from === "user";
  const attributed = isUser ? showAuthorLabels : forcedSenders;
  const peer = isPeerRow(message, currentUserId);
  const face = attributed && isRunStart ? renderSenderAvatar?.(message) : null;
  const toneClass = attributed ? senderNameClass?.(message) : undefined;
  const streaming = message.isStreaming && sourceIndex === messageCount - 1;
  const summary = renderTurnSummary
    ? turnEndSummaries.get(sourceIndex)
    : undefined;

  const agentBubbled = !isUser && attributed === true;
  const senderName = peer
    ? attributed && isRunStart
      ? senderNameFor(message.author, currentUserId)
      : null
    : agentBubbled && isRunStart
      ? (agentLabel ?? null)
      : null;
  const ownBubbleClass =
    isUser && !peer && attributed
      ? "group-[.is-user]:rounded-xl group-[.is-user]:rounded-tr-sm group-[.is-user]:px-3 group-[.is-user]:py-2"
      : undefined;
  const body = (
    <ChatMessageBody
      bubbleClassName={ownBubbleClass}
      currentUserId={currentUserId}
      mentionPeople={mentionPeople}
      message={message}
      nameSlot={
        senderName ? (
          <ChatSenderName name={senderName} toneClass={toneClass} />
        ) : null
      }
      onOpenLink={onOpenLink}
      renderLink={renderLink}
      renderUserMessage={renderUserMessage}
      streaming={streaming}
      transformContent={transformContent}
    />
  );
  const trailer = summary ? renderTurnSummary?.(summary) : null;

  const copyable =
    enableMessageCopy === true &&
    !streaming &&
    message.content.length > 0 &&
    (canCopyMessage?.(message) ?? true);
  const editable =
    isUser &&
    !peer &&
    !streaming &&
    onEditMessage !== undefined &&
    message.turnId !== undefined &&
    (canEditMessage?.(message) ?? true);
  const actionsRow = (
    <ChatMessageActionsRow
      align={isUser && !peer ? "end" : "start"}
      copyMessageLabel={copyMessageLabel}
      copyable={copyable}
      editMessageLabel={editMessageLabel}
      message={message}
      onEditMessage={editable ? onEditMessage : undefined}
    />
  );

  if (isUser && !peer && messageEditing?.editingKey === message.key) {
    return (
      <Message
        {...sharedProps}
        className={cn(sharedProps.className, "max-w-full")}
        from="user"
      >
        <ChatMessageEditor
          initialText={message.content}
          labels={messageEditing.labels}
          onCancel={messageEditing.onCancel}
          onSubmit={(text) => messageEditing.onSubmit(message, text)}
        />
      </Message>
    );
  }

  if (peer || agentBubbled) {
    return (
      <Message
        {...sharedProps}
        avatar={renderMessageAvatar?.(message)}
        from={message.from}
        peer
      >
        <ChatPeerRow face={face}>
          {body}
          {actionsRow}
          {trailer}
        </ChatPeerRow>
      </Message>
    );
  }

  const ownAnnouncement = announcesSelfAuthorship(
    message,
    currentUserId,
    attributed,
  )
    ? authorLabels?.you
    : undefined;

  return (
    <Message
      {...sharedProps}
      avatar={renderMessageAvatar?.(message)}
      from={message.from}
    >
      <div>
        {ownAnnouncement ? (
          <span className="sr-only">{ownAnnouncement}</span>
        ) : null}
        {body}
        {actionsRow}
        {trailer}
      </div>
    </Message>
  );
}
