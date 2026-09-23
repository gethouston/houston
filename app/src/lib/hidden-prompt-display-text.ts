/**
 * What the user's bubble shows when the wire prompt is not what they wrote.
 *
 * A prompt builder swaps in text the user should never see (a hidden setup
 * directive, or attachment paths appended to their words), so the bubble
 * renders the clean `text` instead, live and on every history reload.
 *
 * An EMPTY `text` means the user wrote nothing at all (Houston started the
 * conversation on its own). That is not a bubble to correct, it is a bubble
 * that must not exist: carrying `""` here would persist an empty user message
 * and render a blank bubble on reload, so it resolves to nothing instead. The
 * hidden prompt itself rides the auto-continue marker, which is what keeps the
 * bubble off both the live and the replayed feed.
 */
export function hiddenPromptDisplayText(
  text: string,
  hasHiddenPrompt: boolean,
): string | undefined {
  return hasHiddenPrompt && text.length > 0 ? text : undefined;
}
