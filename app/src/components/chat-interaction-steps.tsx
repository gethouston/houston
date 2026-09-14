import type { MessageApproval } from "@houston/protocol/approval";
import {
  ChatInteractionCard,
  type ChatInteractionCardProps,
  type ChatInteractionStep,
} from "@houston-ai/chat";
import type { ReactNode } from "react";
import type { ApprovalCardCopy } from "../lib/interaction-approval-labels";
import { localizeApprovalQuestion } from "../lib/interaction-approval-labels";
import { approvalsFromAnswers } from "../lib/interaction-approvals";
import type { NonPlanReadyStep } from "../lib/plan-ready";
import { providerName } from "../lib/providers";
import type { TurnMode } from "../lib/turn-mode";
import {
  createInteractionOutcomes,
  hasQuestionStep,
  type InteractionT,
  interactionReplyMessage,
} from "./chat-interaction-reply";
import { interactionStepCards } from "./chat-interaction-step-cards";
import type { useToolkitBrandResolver } from "./use-toolkit-brand-resolver";

export interface ChatInteractionStepsArgs {
  /** The plan_ready-free steps the stepper walks, in wire order. */
  steps: readonly NonPlanReadyStep[];
  agentId: string;
  /** The AI Manager connects apps for the ACCOUNT, an agent chat for its agent. */
  accountScope: boolean;
  labels: ChatInteractionCardProps["labels"];
  approvalCopy: ApprovalCardCopy;
  resolveBrand: ReturnType<typeof useToolkitBrandResolver>;
  onDismiss: () => void;
  onSend: (
    text: string,
    mode?: TurnMode,
    approvals?: MessageApproval[],
  ) => void;
  t: InteractionT;
}

/**
 * The composer-replacing interaction stepper, built for ONE pending
 * interaction.
 *
 * A plain builder rather than a component: the outcome log it creates must live
 * exactly as long as the panel's memo entry for this interaction (see
 * `InteractionOutcomes`), and a component would re-mint it on every render and
 * lose every answer already walked.
 */
export function chatInteractionStepsNode(
  args: ChatInteractionStepsArgs,
): ReactNode {
  const { steps, labels, approvalCopy, resolveBrand, onDismiss, onSend, t } =
    args;
  // Map the protocol steps into ui/chat steps, resolving each question step's
  // optional `toolkit` into a presentational brand (logo + name) so a question
  // that concerns an integration wears the app's identity in its title. A step
  // with no toolkit passes through unbranded; a catalog miss keeps the question
  // plain-titled with a prettified name and no logo — never a crash.
  const mapped: ChatInteractionStep[] = steps.map((step) => {
    // A custom step's title is user-facing, so it carries the provider's
    // display name; the raw wire id never reaches a surface.
    if (step.kind === "provider_connect")
      return {
        kind: "custom",
        id: step.id,
        title: providerName(step.provider),
      };
    if (step.kind !== "question") return step;
    const question = localizeApprovalQuestion(step, approvalCopy);
    return step.toolkit
      ? { ...question, brand: resolveBrand(step.toolkit) }
      : question;
  });
  const outcomes = createInteractionOutcomes();
  return (
    <ChatInteractionCard
      steps={mapped}
      labels={labels}
      onDismiss={onDismiss}
      onComplete={(answers) =>
        onSend(
          interactionReplyMessage({
            steps,
            answers,
            outcomes,
            hasQuestionSteps: hasQuestionStep(mapped),
            t,
          }),
          undefined,
          approvalsFromAnswers(mapped, answers),
        )
      }
      {...interactionStepCards({
        steps,
        agentId: args.agentId,
        accountScope: args.accountScope,
        outcomes,
      })}
    />
  );
}
