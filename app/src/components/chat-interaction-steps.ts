import type { MessageApproval } from "@houston/protocol/approval";
import type {
  ChatInteractionCardProps,
  ChatInteractionStep,
} from "@houston-ai/chat";
import { handsOnScreenLabel } from "../lib/hands-on-screens";
import type { ApprovalCardCopy } from "../lib/interaction-approval-labels";
import { localizeApprovalQuestion } from "../lib/interaction-approval-labels";
import type { NonPlanReadyStep } from "../lib/plan-ready";
import type { TurnMode } from "../lib/turn-mode";
import type { InteractionT } from "./chat-interaction-reply";
import type { useToolkitBrandResolver } from "./use-toolkit-brand-resolver";

export interface ChatInteractionStepsArgs {
  steps: readonly NonPlanReadyStep[];
  agentId: string;
  conversationId: string | null;
  accountScope: boolean;
  labels: ChatInteractionCardProps["labels"];
  approvalCopy: ApprovalCardCopy;
  resolveBrand: ReturnType<typeof useToolkitBrandResolver>;
  resolveProviderName: (providerId: string) => string;
  onDismiss: () => void;
  onSend: (
    text: string,
    mode?: TurnMode,
    approvals?: MessageApproval[],
    files?: readonly File[],
  ) => Promise<boolean>;
  t: InteractionT;
}

export function mapInteractionSteps(args: {
  steps: readonly NonPlanReadyStep[];
  approvalCopy: ApprovalCardCopy;
  resolveBrand: ReturnType<typeof useToolkitBrandResolver>;
  resolveProviderName: (providerId: string) => string;
  resolveAgentName: (agentId: string) => string | undefined;
  t: InteractionT;
}): ChatInteractionStep[] {
  const {
    steps,
    approvalCopy,
    resolveBrand,
    resolveProviderName,
    resolveAgentName,
    t,
  } = args;
  return steps.map((step) => {
    if (step.kind === "provider_connect")
      return {
        kind: "custom",
        id: step.id,
        title: resolveProviderName(step.provider),
      };
    if (step.kind === "hands_on") {
      const label = handsOnScreenLabel(step, resolveAgentName);
      return {
        kind: "custom",
        id: step.id,
        title:
          "name" in label
            ? t(`chat:${label.key}`, { name: label.name })
            : t(`chat:${label.key}`),
      };
    }
    if (step.kind !== "question") return step;
    const question = localizeApprovalQuestion(step, approvalCopy);
    return step.toolkit
      ? { ...question, brand: resolveBrand(step.toolkit) }
      : question;
  });
}
