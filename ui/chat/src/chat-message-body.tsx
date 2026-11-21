import type { ReactNode } from "react";
import type { RenderLinkProps } from "./ai-elements/message";
import { MessageContent, MessageResponse } from "./ai-elements/message";
import type { ChatMessage } from "./feed-to-messages";
import type { MentionTarget } from "./mention-spans.ts";
import { PlainMessageText } from "./plain-message-text";
import type { MentionPerson } from "./types";

interface ChatMessageBodyProps {
  message: ChatMessage;
  streaming: boolean;
  transformContent?: (content: string) => {
    content: string;
    extra?: ReactNode;
  };
  renderUserMessage?: (msg: ChatMessage) => ReactNode | undefined;
  onOpenLink?: (url: string) => void;
  renderLink?: (props: RenderLinkProps) => ReactNode;
  mentionPeople?: readonly MentionPerson[];
  currentUserId?: string;
  nameSlot?: ReactNode;
  bubbleClassName?: string;
}

function mentionTargets({
  message,
  mentionPeople,
  currentUserId,
}: Pick<ChatMessageBodyProps, "message" | "mentionPeople" | "currentUserId">):
  | MentionTarget[]
  | undefined {
  if (message.from === "user") {
    const named = (message.mentions ?? []).filter(
      (mention) => typeof mention.name === "string" && mention.name.length > 0,
    );
    if (named.length === 0) return undefined;
    return named.map((mention) => ({
      name: mention.name as string,
      userId: mention.userId,
      isSelf: mention.userId === currentUserId,
    }));
  }
  if (message.from !== "assistant" || !mentionPeople?.length) return undefined;
  return mentionPeople.map((person) => ({
    name: person.name,
    userId: person.userId,
    isSelf: person.userId === currentUserId,
  }));
}

const CHAT_MARKDOWN_SCALE = [
  "[&_h1]:text-xl [&_h2]:text-lg [&_:is(h3,h4)]:text-base [&_:is(h5,h6)]:text-sm",
  "[&_:is(h1,h2)]:mt-5 [&_:is(h3,h4,h5,h6)]:mt-4",
].join(" ");

export function ChatMessageBody({
  message,
  streaming,
  transformContent,
  renderUserMessage,
  onOpenLink,
  renderLink,
  mentionPeople,
  currentUserId,
  nameSlot,
  bubbleClassName,
}: ChatMessageBodyProps) {
  if (!message.content) {
    if (!nameSlot) return null;
    return (
      <MessageContent className={bubbleClassName}>{nameSlot}</MessageContent>
    );
  }
  if (message.from === "user" && renderUserMessage) {
    const custom = renderUserMessage(message);
    if (custom !== undefined)
      return nameSlot ? (
        <div className="flex min-w-0 flex-col gap-1">
          {nameSlot}
          {custom}
        </div>
      ) : (
        custom
      );
  }
  const transformed =
    message.from === "assistant" && transformContent
      ? transformContent(message.content)
      : null;

  return (
    <MessageContent className={bubbleClassName}>
      {nameSlot ? <div className="-mb-1">{nameSlot}</div> : null}
      {message.from === "user" ? (
        <PlainMessageText
          text={message.content}
          mentions={mentionTargets({ message, mentionPeople, currentUserId })}
          onOpenLink={onOpenLink}
        />
      ) : (
        <MessageResponse
          className={CHAT_MARKDOWN_SCALE}
          isAnimating={streaming}
          mentions={mentionTargets({ message, mentionPeople, currentUserId })}
          onOpenLink={onOpenLink}
          renderLink={renderLink}
        >
          {transformed?.content ?? message.content}
        </MessageResponse>
      )}
      {transformed?.extra}
    </MessageContent>
  );
}
