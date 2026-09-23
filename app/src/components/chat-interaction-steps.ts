import type { MessageApproval } from "@houston/protocol/approval";
import type {
  ChatInteractionCardProps,
  ChatInteractionStep,
} from "@houston-ai/chat";
import { handsOnScreenKey } from "../lib/hands-on-navigation";
import type { ApprovalCardCopy } from "../lib/interaction-approval-labels";
import { localizeApprovalQuestion } from "../lib/interaction-approval-labels";
import type { NonPlanReadyStep } from "../lib/plan-ready";
import type { TurnMode } from "../lib/turn-mode";
import type { InteractionT } from "./chat-interaction-reply";
import type { useToolkitBrandResolver } from "./use-toolkit-brand-resolver";

export interface ChatInteractionStepsArgs {
  /** The plan_ready-free steps the stepper walks, in wire order. */
  steps: readonly NonPlanReadyStep[];
  agentId: string;
  /** The conversation the interaction belongs to, `null` before its id lands. */
  conversationId: string | null;
  /** The AI Manager connects apps for the ACCOUNT, an agent chat for its agent. */
  accountScope: boolean;
  labels: ChatInteractionCardProps["labels"];
  approvalCopy: ApprovalCardCopy;
  resolveBrand: ReturnType<typeof useToolkitBrandResolver>;
  /** Names a requested AI provider through the GATED connect list — the same
   *  list its card acts on, so title and card never name different things. */
  resolveProviderName: (providerId: string) => string;
  onDismiss: () => void;
  onSend: (
    text: string,
    mode?: TurnMode,
    approvals?: MessageApproval[],
  ) => void;
  t: InteractionT;
}

/**
 * Map the protocol steps into ui/chat steps, resolving each question step's
 * optional `toolkit` into a presentational brand (logo + name) so a question
 * that concerns an integration wears the app's identity in its title. A step
 * with no toolkit passes through unbranded; a catalog miss keeps the question
 * plain-titled with a prettified name and no logo — never a crash.
 *
 * Pure, and kept out of the stepper component so that file stays the wiring:
 * the mapping depends on the localized copy and the brand catalog, both of
 * which move under the stepper while the user walks it.
 */
export function mapInteractionSteps(args: {
  steps: readonly NonPlanReadyStep[];
  approvalCopy: ApprovalCardCopy;
  resolveBrand: ReturnType<typeof useToolkitBrandResolver>;
  resolveProviderName: (providerId: string) => string;
  t: InteractionT;
}): ChatInteractionStep[] {
  const { steps, approvalCopy, resolveBrand, resolveProviderName, t } = args;
  return steps.map((step) => {
    // A custom step's title is user-facing, so it carries the provider's
    // display name; the raw wire id never reaches a surface.
    if (step.kind === "provider_connect")
      return {
        kind: "custom",
        id: step.id,
        title: resolveProviderName(step.provider),
      };
    // A hands-on errand rides the same generic custom step: the app owns every
    // pixel of its body, so ui/chat needs nothing but its id.
    if (step.kind === "hands_on")
      return {
        kind: "custom",
        id: step.id,
        title: t(`chat:${handsOnScreenKey(step.surface)}`),
      };
    if (step.kind !== "question") return step;
    const question = localizeApprovalQuestion(step, approvalCopy);
    return step.toolkit
      ? { ...question, brand: resolveBrand(step.toolkit) }
      : question;
  });
}
