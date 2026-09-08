import type { InteractionStep } from "@houston/protocol/interaction";
import type { ChatInteractionStep } from "@houston-ai/chat";

/** Approval labels belong to the surface's locale, never the runtime. */
export function localizeApprovalQuestion(
  step: Extract<InteractionStep, { kind: "question" }>,
  labels: { approve: string; decline: string; closing: string },
): Extract<ChatInteractionStep, { kind: "question" }> {
  const approval =
    step.requestId !== undefined &&
    step.options?.some((option) => option.kind === "approval");
  return {
    ...step,
    question: approval ? `${step.question} ${labels.closing}` : step.question,
    options: step.options?.map((option) =>
      option.kind === "approval"
        ? { ...option, label: labels[option.id] }
        : option,
    ),
  };
}
