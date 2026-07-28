/**
 * A message's rendered body: the markdown/user content inside its bubble. Split
 * out of `chat-message-item.tsx` so that file stays a thin row composer (sender
 * line + body + turn summary) and each piece keeps its own docs.
 */

import type { ReactNode } from "react";
import type { RenderLinkProps } from "./ai-elements/message";
import { MessageContent, MessageResponse } from "./ai-elements/message";
import type { ChatMessage } from "./feed-to-messages";
import type { MentionTarget } from "./mention-spans.ts";
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
  /** The space roster an ASSISTANT message's "@Name" runs are matched against
   *  (HOU-944). A user message uses its own recorded mentions instead. */
  mentionPeople?: readonly MentionPerson[];
  /** The signed-in viewer, so a mention of them renders emphasized. */
  currentUserId?: string;
}

/**
 * Who this message may chip. A USER turn carries its own structured mentions
 * (recorded at send time, so a later rename still chips the original text); an
 * ASSISTANT turn mentions people in plain prose, so it matches against the
 * roster the consumer supplied.
 */
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

export function ChatMessageBody({
  message,
  streaming,
  transformContent,
  renderUserMessage,
  onOpenLink,
  renderLink,
  mentionPeople,
  currentUserId,
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
        mentions={mentionTargets({ message, mentionPeople, currentUserId })}
        onOpenLink={onOpenLink}
        renderLink={renderLink}
      >
        {transformed?.content ?? message.content}
      </MessageResponse>
      {transformed?.extra}
    </MessageContent>
  );
}
