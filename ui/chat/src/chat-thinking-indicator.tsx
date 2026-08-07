"use client";

import { ChatStatusLine } from "./chat-status-line";
import { DEFAULT_THINKING_PHRASES } from "./thinking-phrases";
import { useRotatingPhrase } from "./use-rotating-phrase";

export interface ChatThinkingIndicatorProps {
  /** The rotating one-liners. Defaults to a small English set so ui/chat works
   *  standalone; the app passes the full localized list. */
  phrases?: string[];
}

/**
 * The connecting/pre-reply loading state (HOU-910, PRODUCT-1226): a rotating
 * astronaut one-liner shown ONLY while the agent has produced no output yet —
 * the moment an active mission log appears, the header there takes over with
 * the concrete task and this line is suppressed (HOU-471). Phrases play from a
 * shuffled deck (no repeats until it exhausts, then a reshuffle that avoids an
 * immediate repeat), advancing every ~4s for as long as the indicator stays
 * mounted. The shuffle and timer live in an effect, never in render.
 *
 * Visually it IS the mission-log header line — the same `ChatStatusLine`
 * (13px helmet, text-xs, shimmer) — so the loading row and the "Mission log"
 * row read as one component at one size (PRODUCT-1226).
 */
export function ChatThinkingIndicator({
  phrases = DEFAULT_THINKING_PHRASES,
}: ChatThinkingIndicatorProps) {
  const phrase = useRotatingPhrase(phrases);
  return (
    <ChatStatusLine active className="py-1 text-ink-muted" label={phrase} />
  );
}
