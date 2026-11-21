import type { InteractionStep } from "@houston/protocol/interaction";
import type {
  ChatInteractionOption,
  ChatInteractionStep,
} from "@houston-ai/chat";
import { canPurchaseInApp, isPurchaseOperation } from "./purchase-policy";

type QuestionStep = Extract<InteractionStep, { kind: "question" }>;
type ChatQuestionStep = Extract<ChatInteractionStep, { kind: "question" }>;

export function refusesPurchaseApproval(
  operation: string | undefined,
): boolean {
  return (
    operation !== undefined &&
    isPurchaseOperation(operation) &&
    !canPurchaseInApp()
  );
}

export function storeRefusalQuestion(
  step: QuestionStep,
  options: ChatInteractionOption[] | undefined,
  copy: { storeRefusal: string; storeRefusalOk: string },
): ChatQuestionStep {
  const { detail: _english, approval: _approval, ...rest } = step;
  return {
    ...rest,
    question: copy.storeRefusal,
    options: options
      ?.filter(
        (option) => option.kind === "approval" && option.id === "decline",
      )
      .map((option) => ({ ...option, label: copy.storeRefusalOk })),
  };
}
