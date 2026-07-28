/**
 * A message's rendered body: the markdown/user content inside its bubble. Split
 * out of `chat-message-item.tsx` so that file stays a thin row composer (sender
 * line + body + turn summary) and each piece keeps its own docs.
 */

import type { ReactNode } from "react";
import type { RenderLinkProps } from "./ai-elements/message";
import { MessageContent, MessageResponse } from "./ai-elements/message";
import type { ChatMessage } from "./feed-to-messages";

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
}

export function ChatMessageBody({
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
