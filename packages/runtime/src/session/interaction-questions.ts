import {
  currentInteractionHolder,
  type QuestionOptions,
  type QuestionStep,
} from "./interaction-holder";

export function recordConfirmation(input: {
  question: string;
  detail?: string;
  options: QuestionOptions;
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

export function recordQuestions(questions: QuestionStep[]): void {
  const holder = currentInteractionHolder();
  if (!holder) return;
  holder.questions.length = 0;
  holder.questions.push(...questions);
}
