import {
  currentInteractionHolder,
  type QuestionOptions,
  type QuestionStep,
} from "./interaction-holder";

/**
 * Raise the approval card for one destructive Houston operation.
 *
 * ONE REQUEST, ONE CARD. Cards are deduped by the host-issued `requestId` and
 * NEVER by their question text: two calls can read alike and do different
 * things, so folding them into one card would let a single click grant two
 * grants. A repeat of the SAME request (a retried pending call) is still one
 * card.
 *
 * APPEND, never replace: unlike the model's own questions this step is the
 * runtime's, and losing it would mean the user never saw what they are about to
 * approve. A no-op outside a turn.
 */
export function recordConfirmation(input: {
  question: string;
  /** The host-authored verbatim arguments too long for the question line. */
  detail?: string;
  options: QuestionOptions;
  /** The host's id for the pending request this card decides. */
  requestId: string;
}): void {
  const holder = currentInteractionHolder();
  if (!holder) return;
  if (holder.confirmations.some((c) => c.requestId === input.requestId)) return;
  holder.confirmations.push({
    kind: "question",
    id: `x${holder.confirmations.length + 1}`,
    question: input.question,
    ...(input.detail ? { detail: input.detail } : {}),
    options: input.options,
    requestId: input.requestId,
  });
}

/**
 * Set the question steps for this turn (REPLACE — a model that asks twice
 * settles on its final batch). A no-op outside a turn.
 */
export function recordQuestions(questions: QuestionStep[]): void {
  const holder = currentInteractionHolder();
  if (!holder) return;
  holder.questions.length = 0;
  holder.questions.push(...questions);
}
