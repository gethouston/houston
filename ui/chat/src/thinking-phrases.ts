/**
 * Pure, DOM-free deck logic for the thinking indicator's rotating one-liners
 * (HOU-910). Kept out of the React component so the shuffle/advance rules stay
 * unit-testable and so no `Math.random` runs during render — the component
 * seeds and advances the deck from an effect and hands its own RNG in here.
 */

/** Built-in English fallback so ui/chat works standalone; the app overrides it
 *  with the full localized list via the `phrases` prop. */
export const DEFAULT_THINKING_PHRASES = [
  "Houston, we have a solution!",
  "Aligning the satellites...",
  "Warming up the boosters...",
  "Plotting the trajectory...",
  "Almost there, cadet...",
];

/** A shuffled play order over the phrase set plus a cursor into it. Every
 *  phrase shows once before any repeats; exhausting the order reshuffles. */
export interface PhraseDeck {
  readonly order: readonly string[];
  readonly index: number;
}

/** Fisher-Yates over a copy, driven by the supplied RNG (a `[0, 1)` source). */
export function shuffle(
  items: readonly string[],
  random: () => number,
): string[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Fresh deck with a random first phrase. Empty input yields an empty deck. */
export function createDeck(
  phrases: readonly string[],
  random: () => number,
): PhraseDeck {
  return { order: shuffle(phrases, random), index: 0 };
}

/** The phrase currently on screen (empty string for an empty deck). */
export function currentPhrase(deck: PhraseDeck): string {
  return deck.order[deck.index] ?? "";
}

/** Advance one step. Mid-deck it just moves the cursor; at the end it reshuffles
 *  the same phrases, avoiding an immediate repeat of the last one shown. */
export function advanceDeck(
  deck: PhraseDeck,
  random: () => number,
): PhraseDeck {
  const next = deck.index + 1;
  if (next < deck.order.length) return { order: deck.order, index: next };

  const last = deck.order[deck.order.length - 1];
  const reshuffled = shuffle(deck.order, random);
  // Guard the seam: if the reshuffle would replay `last` first, swap it away.
  if (reshuffled.length > 1 && reshuffled[0] === last) {
    const swap = 1 + Math.floor(random() * (reshuffled.length - 1));
    [reshuffled[0], reshuffled[swap]] = [reshuffled[swap], reshuffled[0]];
  }
  return { order: reshuffled, index: 0 };
}
