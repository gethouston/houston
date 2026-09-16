/**
 * The ONE reading of an integration action slug: its words, with the toolkit's
 * own name taken off the front.
 *
 * Action slugs arrive as the integration layer stores them — `GMAIL_SEND_EMAIL`
 * — and every surface that names one to a user shows the app beside it (a logo,
 * a chip, a branded row), so repeating the app inside the action reads as
 * stutter. Two surfaces name actions: the workflow step chip
 * (`@houston-ai/skills`, `humanizeIntegrationAction`) and the chat's
 * process/updates rows (`@houston-ai/chat`, `humanizeActionGerund` /
 * `humanizeActionDone`). They conjugate differently on purpose; they must never
 * disagree about WHICH words the toolkit ate, which is why the stripping lives
 * here and not twice.
 *
 * Pure and DOM-free — imported by BOTH packages through this deep path rather
 * than the `@houston-ai/core` barrel, because both consumers are `node --test`
 * modules and the barrel pulls the whole React component library in.
 */

/** Letters and digits only, so two spellings of the same name compare equal. */
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
