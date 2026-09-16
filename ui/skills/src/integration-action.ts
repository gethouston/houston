import { actionWordsWithoutToolkit } from "@houston-ai/core/src/integration-action-words.ts";

/**
 * A readable name for the action a workflow step runs on its connected app.
 * Action slugs arrive as the integration layer stores them —
 * `GMAIL_SEND_EMAIL` — which is machine vocabulary a non-technical owner
 * should never read. The toolkit is already shown beside the action (as a logo
 * or the slug), so its prefix is dropped: `GMAIL_SEND_EMAIL` + `gmail` reads
 * "Send email". The stripping itself is the shared
 * {@link actionWordsWithoutToolkit}, so this chip and the chat's action rows
 * can never disagree about which words belonged to the app.
 *
 * Returns null when there is no action to name, so a caller renders the app
 * alone instead of an empty label.
 */
export function humanizeIntegrationAction(
  toolkit: string,
  action: string | null,
): string | null {
  const words = (action ?? "")
    .split("_")
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
  if (words.length === 0) return null;
  // A slug that is nothing but the toolkit ("GMAIL") keeps every word: better
  // to repeat the app's name than to name no action at all.
  const stripped = actionWordsWithoutToolkit(action ?? "", toolkit);
  const spoken = stripped.length > 0 ? stripped : words;
  const sentence = spoken.map((word) => word.toLowerCase()).join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
