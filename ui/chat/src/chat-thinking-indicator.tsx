"use client";

import { HoustonHelmet } from "@houston-ai/core";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import {
  advanceDeck,
  createDeck,
  currentPhrase,
  DEFAULT_THINKING_PHRASES,
} from "./thinking-phrases";

/** How long each one-liner stays before the next rotates in. */
const ROTATE_MS = 4000;

export interface ChatThinkingIndicatorProps {
  /** The rotating one-liners. Defaults to a small English set so ui/chat works
   *  standalone; the app passes the full localized list. */
  phrases?: string[];
}

/**
 * The pre-reply loading state (HOU-910): a pulsing Houston helmet beside a
 * rotating astronaut one-liner that keeps waiting users entertained. Phrases
 * play from a shuffled deck (no repeats until it exhausts, then a reshuffle
 * that avoids an immediate repeat), advancing every ~4s for as long as the
 * indicator stays mounted. The shuffle and timer live in an effect, never in
 * render. A soft fade-through carries each change, collapsed to a plain swap
 * under `prefers-reduced-motion`.
 */
export function ChatThinkingIndicator({
  phrases = DEFAULT_THINKING_PHRASES,
}: ChatThinkingIndicatorProps) {
  const reduceMotion = useReducedMotion();
  const [phrase, setPhrase] = useState("");

  useEffect(() => {
    if (phrases.length === 0) {
      setPhrase("");
      return;
    }
    let deck = createDeck(phrases, Math.random);
    setPhrase(currentPhrase(deck));
    const id = window.setInterval(() => {
      deck = advanceDeck(deck, Math.random);
      setPhrase(currentPhrase(deck));
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [phrases]);

  return (
    <div className="flex items-center gap-2 py-1 text-ink-muted">
      <HoustonHelmet className="animate-pulse" color="currentColor" size={20} />
      {/* Bounded, single-line so a longer phrase truncates instead of nudging
          the helmet or reflowing the row as phrases rotate. */}
      <div className="min-w-0 max-w-xs overflow-hidden">
        {reduceMotion ? (
          <span className="block truncate text-sm">{phrase}</span>
        ) : (
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              animate={{ opacity: 1 }}
              className="block truncate text-sm"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key={phrase}
              transition={{ duration: 0.35 }}
            >
              {phrase}
            </motion.span>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
