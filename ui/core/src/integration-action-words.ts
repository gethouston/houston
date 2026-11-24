function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * The action's words past its leading toolkit token.
 *
 * Compared on letters and digits only, word by word, so a multi-word toolkit
 * matches however either side spells it (`google_maps` or `googlemaps` against
 * `GOOGLE_MAPS_SEARCH`). A word that merely STARTS like the toolkit is kept
 * (`SLACKBOT_PING` on `slack` is not a Slack action with the prefix stripped).
 *
 * Returns the words unchanged when the slug carries no toolkit prefix, and an
 * EMPTY array when the slug is nothing but the toolkit (`GMAIL` on `gmail`) —
 * the caller decides what to say when there is no action word left, because
 * that answer differs per surface.
 */
export function actionWordsWithoutToolkit(
  action: string,
  toolkit: string,
): string[] {
  const words = action
    .split("_")
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
  const slug = normalize(toolkit);
  if (slug.length === 0) return words;
  let consumed = "";
  for (const [index, word] of words.entries()) {
    consumed += normalize(word);
    if (consumed === slug) return words.slice(index + 1);
    if (!slug.startsWith(consumed)) return words;
  }
  return words;
}
