import { cn } from "@houston-ai/core";
import { Message } from "./ai-elements/message";
import {
  announcesSelfAuthorship,
  isPeerRow,
  senderNameFor,
} from "./author-label";
import { ChatMessageBody } from "./chat-message-body";
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

  // Who said this turn. Two independent questions, deliberately:
  //  - WHICH SIDE is a fact about the writer alone (`isPeerRow`), so a
  //    teammate's words are never rendered in the viewer's own bubble;
  //  - WHETHER TO LABEL is the attribution gate: a user row is attributed by
  //    `showAuthorLabels`, an agent row only when attribution is forced on. So
  //    an unlabelled thread still mirrors sides, and a single-player
  //    transcript (authorless rows = own) renders exactly as it always has:
  //    right-aligned bubbles, bare prose.
  const isUser = message.from === "user";
  const attributed = isUser ? showAuthorLabels : forcedSenders;
  const peer = isPeerRow(message, currentUserId);
  const face = attributed && isRunStart ? renderSenderAvatar?.(message) : null;
  const toneClass = attributed ? senderNameClass?.(message) : undefined;
  const streaming = message.isStreaming && sourceIndex === messageCount - 1;
  const summary = renderTurnSummary
    ? turnEndSummaries.get(sourceIndex)
    : undefined;

  // In a group chat the sender's name is the bubble's FIRST LINE — for a
  // teammate AND for the agent, which is just one more member of the group
  // (HOU-960). Either way, only on the row that opens the run.
  const agentBubbled = !isUser && attributed === true;
  const senderName = peer
    ? attributed && isRunStart
      ? senderNameFor(message.author, currentUserId)
      : null
    : agentBubbled && isRunStart
      ? (agentLabel ?? null)
      : null;
  // The viewer's own bubble adopts the compact group geometry only when the
  // thread is attributed, so a single-player transcript keeps its exact shape.
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
          {trailer}
        </ChatPeerRow>
      </Message>
    );
  }

  // The viewer's own bubble carries no visible name — a group chat identifies
  // you by which side you are on. A screen reader cannot see the side, so the
  // consumer's "you" label is announced there instead, but only on a row that
  // actually records the viewer as its author (see `announcesSelfAuthorship`).
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
        {trailer}
      </div>
    </Message>
  );
}
