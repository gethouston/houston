// Pure, DOM-free logic + class tokens for ChatQuestionCard. Kept in a plain
// `.ts` module (mirroring chat-process-classes.ts) so the node:test suite can
// import and assert them without a DOM — the .tsx component re-uses them.

export interface ChatQuestionOption {
  id: string;
  label: string;
}

export interface ChatQuestion {
  id: string;
  question: string;
  options?: ChatQuestionOption[];
}

/** Per-question selected option id (or null when that question is unanswered by
 *  option). One entry per question, keyed by question id. Free text lives once,
 *  shared, at the bottom of the card. */
export type QuestionSelections = Record<string, string | null>;

/** A single question head. Sized up + weighted when it's the ONLY question (the
 *  card replaces the composer, so a lone prompt reads as "the one thing to do").
 *  Batched cards drop to the base size so the stack has rhythm without shouting. */
export const QUESTION_TEXT_CLASS =
  "text-lg font-medium leading-snug text-foreground";
export const QUESTION_TEXT_CLASS_BATCHED =
  "text-base font-medium leading-snug text-foreground";

/** True when the agent offered concrete choices (option rows render). */
export function hasSelectableOptions(options?: ChatQuestionOption[]): boolean {
  return Array.isArray(options) && options.length > 0;
}

/** Trim a typed free-text answer; whitespace-only answers are not sendable. */
export function normalizeAnswer(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** The selected option's label for one question, or null when none is chosen. */
function selectedLabel(
  question: ChatQuestion,
  selections: QuestionSelections,
): string | null {
  const optionId = selections[question.id];
  if (!optionId) return null;
  const option = question.options?.find((o) => o.id === optionId);
  return option ? option.label : null;
}

/**
 * Compose the reply the user sends. For each ANSWERED question a line
 * `"<question>: <selected label>"`, joined by newlines; the shared free text (if
 * any) is appended after a blank line. Only-text → just the text. Returns null
 * when nothing is answered (send stays disabled).
 */
export function composeReply(
  questions: ChatQuestion[],
  selections: QuestionSelections,
  freeText: string,
): string | null {
  const lines: string[] = [];
  for (const question of questions) {
    const label = selectedLabel(question, selections);
    if (label !== null) lines.push(`${question.question}: ${label}`);
  }
  const text = normalizeAnswer(freeText);
  if (lines.length === 0) return text; // only-text (or null when empty)
  const body = lines.join("\n");
  return text === null ? body : `${body}\n\n${text}`;
}

/** Send is enabled when at least one question is answered OR the input has text. */
export function canSend(
  questions: ChatQuestion[],
  selections: QuestionSelections,
  freeText: string,
): boolean {
  return composeReply(questions, selections, freeText) !== null;
}

/**
 * Fast path: exactly one question that HAS options and an empty input. Clicking
 * an option then sends immediately (no separate send press) — the common
 * single-choice case stays one tap.
 */
export function isFastPath(
  questions: ChatQuestion[],
  freeText: string,
): boolean {
  return (
    questions.length === 1 &&
    hasSelectableOptions(questions[0]?.options) &&
    normalizeAnswer(freeText) === null
  );
}
