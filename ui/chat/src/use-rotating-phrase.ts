import { useEffect, useState } from "react";
import { advanceDeck, createDeck, currentPhrase } from "./thinking-phrases";

/** How long each one-liner stays before the next rotates in. */
export const PHRASE_ROTATE_MS = 4000;

/**
 * The astronaut phrase rotation (HOU-910), lifted out of
 * `ChatThinkingIndicator` so the active mission-log header can play the same
 * deck. Phrases play from a shuffled deck (no repeats until it exhausts, then
 * a reshuffle that avoids an immediate repeat), advancing every ~4s while
 * `phrases` stays set. The shuffle and timer live in the effect, never in
 * render. Pass `undefined` (or an empty list) to idle the deck — the hook
 * returns `""` and runs no timer, so a caller can key it off an active flag
 * and keep one continuously-running deck across brief non-phrase stretches.
 */
export function useRotatingPhrase(phrases: string[] | undefined): string {
  const [phrase, setPhrase] = useState("");

  useEffect(() => {
    if (!phrases || phrases.length === 0) {
      setPhrase("");
      return;
    }
    let deck = createDeck(phrases, Math.random);
    setPhrase(currentPhrase(deck));
    const id = window.setInterval(() => {
      deck = advanceDeck(deck, Math.random);
      setPhrase(currentPhrase(deck));
    }, PHRASE_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [phrases]);

  return phrase;
}
