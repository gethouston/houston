// Pure, DOM-free logic + class tokens for ChatQuestionCard. Kept in a plain
// `.ts` module (mirroring chat-process-classes.ts) so the node:test suite can
// import and assert them without a DOM — the .tsx component re-uses them.

export interface ChatQuestionOption {
  id: string;
  label: string;
}

/** The question must read as the single next action: this card REPLACES the
 *  composer while shown, so the prompt is sized up and weighted. */
export const QUESTION_TEXT_CLASS =
  "text-lg font-medium leading-snug text-foreground";

/** The "answer in your own words" escape hatch stays visible at all times
 *  (never hover-gated, per the no-hover-only-affordances rule) but reads as a
 *  quiet, secondary action. */
export const OWN_ANSWER_TOGGLE_CLASS =
  "mt-3 text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50";

/** True when the agent offered concrete choices (option buttons render). */
export function hasSelectableOptions(options?: ChatQuestionOption[]): boolean {
  return Array.isArray(options) && options.length > 0;
}

/** Trim a typed free-text answer; whitespace-only answers are not sendable. */
export function normalizeAnswer(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}
