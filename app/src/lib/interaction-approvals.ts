import type { MessageApproval } from "@houston/protocol/approval";
import type { ChatInteractionAnswer } from "@houston-ai/chat";

export interface ApprovalCardStep {
  id: string;
  requestId?: string;
  options?: { id: string; kind?: "choice" | "approval" }[];
}

export function approvalsFromAnswers(
  steps: ApprovalCardStep[],
  answers: ChatInteractionAnswer[],
): MessageApproval[] {
  const approvals: MessageApproval[] = [];
  for (const answer of answers) {
    const step = steps.find((s) => s.id === answer.stepId);
    if (!step?.requestId || answer.source !== "option") continue;
    const chosen = step.options?.find(
      (o) => o.id === answer.optionId && o.kind === "approval",
    );
    if (!chosen || (chosen.id !== "approve" && chosen.id !== "decline"))
      continue;
    approvals.push({
      requestId: step.requestId,
      decision: chosen.id === "approve" ? "approve" : "deny",
    });
  }
  return approvals;
}
