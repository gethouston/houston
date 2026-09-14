/**
 * The marker that tags a user message Houston sent on the user's behalf.
 *
 * The provider has no "resume without a prompt" concept, so continuing a task
 * needs a USER turn — but the user never typed it, and a visible bubble would
 * read as if they had. Tagging the text lets the model receive the instruction
 * verbatim (it ignores the leading HTML comment) while every transcript
 * filters the bubble out.
 *
 * Lives in the protocol because both sides of the wire mint it: the app
 * (`app/src/lib/auto-continue-message.ts`, which also owns the feed filter)
 * and the runtime's own resume after an engine restart
 * (`packages/runtime/src/session/resume-interrupted-turns.ts`). A drift
 * between two copies of this string would show the user a raw prompt they
 * never wrote.
 */
export const AUTO_CONTINUE_MARKER = "<!--houston:auto_continue-->";

/** Wrap agent-bound text so a transcript can recognize and hide it. */
export function encodeAutoContinue(text: string): string {
  return `${AUTO_CONTINUE_MARKER}\n\n${text}`;
}

/** True for a message Houston auto-sent to resume a task. */
export function isAutoContinue(content: string): boolean {
  return content.startsWith(AUTO_CONTINUE_MARKER);
}
