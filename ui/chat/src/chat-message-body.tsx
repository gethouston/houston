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
  /**
   * The sender's name line (HOU-960), rendered as the bubble's FIRST LINE for a
   * teammate's — or, in a group chat, the agent's — message. Inside rather than
   * above because a name floating over a left-aligned bubble reads as a heading
   * for the whole thread; inside, it reads as part of what that person said.
   * `null` on the viewer's own rows and on every message of a run after the
   * first.
   */
  nameSlot?: ReactNode;
  /** Extra classes for the bubble container (e.g. the group-chat geometry the
   *  viewer's own bubble adopts only when the thread is attributed). */
  bubbleClassName?: string;
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
  nameSlot,
  bubbleClassName,
}: ChatMessageBodyProps) {
  // Nothing to say AND nobody to name → render nothing, as before. But an
  // empty message from a TEAMMATE still has to print who it came from: the
  // name line is that person's byline, and dropping it (the old header did
  // not) would leave an anonymous bubble in a group chat.
  if (!message.content) {
    if (!nameSlot) return null;
    return (
      <MessageContent className={bubbleClassName}>{nameSlot}</MessageContent>
    );
  }
  if (message.from === "user" && renderUserMessage) {
    const custom = renderUserMessage(message);
    // A custom renderer (skill card, attachment card) brings its own container,
    // so the name cannot go inside it; it sits directly above instead, still
    // within the row's bubble column.
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
      {/* The bubble stacks its children on `gap-2` (8px), which is a paragraph
          break, not a name-to-first-line break. Pull the name back to 4px so it
          reads as the speaker's byline rather than a separate line of talk. */}
      {nameSlot ? <div className="-mb-1">{nameSlot}</div> : null}
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
