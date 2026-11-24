/** Built-in English fallback so ui/chat works standalone; the app overrides it
 *  with the full localized list via the `phrases` prop. */
export const DEFAULT_THINKING_PHRASES = [
  "Houston, we have a solution!",
  "Aligning the satellites...",
  "Warming up the boosters...",
  "Plotting the trajectory...",
  "Almost there, cadet...",
];

export interface PhraseDeck {
  readonly order: readonly string[];
  readonly index: number;
}

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

export function createDeck(
  phrases: readonly string[],
  random: () => number,
): PhraseDeck {
  return { order: shuffle(phrases, random), index: 0 };
}

export function currentPhrase(deck: PhraseDeck): string {
  return deck.order[deck.index] ?? "";
}

export function advanceDeck(
  deck: PhraseDeck,
  random: () => number,
): PhraseDeck {
  const next = deck.index + 1;
  if (next < deck.order.length) return { order: deck.order, index: next };

  const last = deck.order[deck.order.length - 1];
  const reshuffled = shuffle(deck.order, random);
  if (reshuffled.length > 1 && reshuffled[0] === last) {
    const swap = 1 + Math.floor(random() * (reshuffled.length - 1));
    [reshuffled[0], reshuffled[swap]] = [reshuffled[swap], reshuffled[0]];
  }
  return { order: reshuffled, index: 0 };
}
