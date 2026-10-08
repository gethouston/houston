import type { InteractionStep } from "@houston/protocol/interaction";
import type {
  ChatInteractionOption,
  ChatInteractionStep,
} from "@houston-ai/chat";
import { canPurchaseInApp, isPurchaseOperation } from "./purchase-policy";

type QuestionStep = Extract<InteractionStep, { kind: "question" }>;
type ChatQuestionStep = Extract<ChatInteractionStep, { kind: "question" }>;

/**
 * True when the AI Manager's approval card asks to start a purchase (a
 * checkout or a billing portal) inside a store app, which never sells.
 */
export function refusesPurchaseApproval(
  operation: string | undefined,
): boolean {
  return (
    operation !== undefined &&
    isPurchaseOperation(operation) &&
    !canPurchaseInApp()
  );
}

/**
 * The purchase approval card a store app draws: it cannot approve, so it says
 * where the plan is managed and offers one answer, the decline. The host then
 * refuses the call, and the manager reads the same sentence in the reply
 * (`"<question>: <answer>"`) and can relay it.
 */
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
