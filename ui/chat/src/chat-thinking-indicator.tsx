"use client";

import { ChatStatusLine } from "./chat-status-line";
import { DEFAULT_THINKING_PHRASES } from "./thinking-phrases";
import { useRotatingPhrase } from "./use-rotating-phrase";

export interface ChatThinkingIndicatorProps {
  phrases?: string[];
}

export function ChatThinkingIndicator({
  phrases = DEFAULT_THINKING_PHRASES,
}: ChatThinkingIndicatorProps) {
  const phrase = useRotatingPhrase(phrases);
  return (
    <ChatStatusLine active className="py-1 text-ink-muted" label={phrase} />
  );
}
