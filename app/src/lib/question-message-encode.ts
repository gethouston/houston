/**
 * Encoder + readable formatter for structured question answers.
 * Kept separate so node tests can import without loading `@houston-ai/chat`.
 */

import type { QuestionAnswerSet, QuestionSpec } from "@houston-ai/chat";

const ANSWER_MARKER_PREFIX = "<!--houston:question-answer ";
const ANSWER_MARKER_SUFFIX = "-->";

function labelForOption(
  spec: QuestionSpec,
  questionId: string,
  optionId: string,
): string | null {
  const question = spec.questions.find((q) => q.id === questionId);
  if (!question) return null;
  return question.options.find((o) => o.id === optionId)?.label ?? null;
}

/** Human-readable summary the model reads on the next turn. */
export function formatQuestionAnswersReadable(
  spec: QuestionSpec,
  answerSet: QuestionAnswerSet,
): string {
  const lines: string[] = [];
  for (const answer of answerSet.answers) {
    const question = spec.questions.find((q) => q.id === answer.questionId);
    if (!question) continue;
    const parts: string[] = [];
    for (const optionId of answer.optionIds) {
      const label = labelForOption(spec, answer.questionId, optionId);
      if (label) parts.push(label);
    }
    if (answer.text?.trim()) {
      parts.push(answer.text.trim());
    }
    if (parts.length === 0) continue;
    lines.push(`${question.prompt}\n${parts.join(", ")}`);
  }
  return lines.join("\n\n");
}

/**
 * Wrap the user's structured answers so the chat renderer can show a card
 * and the engine persists a single value.
 */
export function encodeQuestionAnswerMessage(
  spec: QuestionSpec,
  answerSet: QuestionAnswerSet,
): string {
  const json = JSON.stringify(answerSet);
  const readable = formatQuestionAnswersReadable(spec, answerSet);
  return `${ANSWER_MARKER_PREFIX}${json}${ANSWER_MARKER_SUFFIX}\n\n${readable}`;
}
