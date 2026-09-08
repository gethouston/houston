import type { MessageApproval } from "@houston/protocol/approval";
import type { ChatInteractionAnswer } from "@houston-ai/chat";

/**
 * A destructive Houston operation's approval, read off the card the person
 * actually clicked.
 *
 * The receipt these produce is what the HOST matches against the request it
 * issued (`packages/host/src/assistant/approvals.ts`); it travels as a marker on
 * the reply text (`@houston/protocol/approval`) and never reaches the model.
 */

/** The shape {@link approvalsFromAnswers} needs off one interaction step: its
 *  id, the host-issued approval request it decides (approval cards only), and
 *  the options it offered, so an answer maps back to the option that produced
 *  it rather than to its wording. */
export interface ApprovalCardStep {
  id: string;
  requestId?: string;
  options?: { id: string; label: string }[];
}

/**
 * The receipts a walked interaction sequence sends back: one per approval card
 * the user actually answered by picking an option.
 *
 * FAIL CLOSED, twice over. An answer that matches no option (the user typed
 * something instead of choosing) yields NO receipt at all, so the host retires
 * the card and the agent has to ask again — a person who typed "what does that
 * mean?" has not approved anything. And the decision comes from the OPTION'S
 * ID, never from its wording, so nothing here depends on prose.
 */
export function approvalsFromAnswers(
  steps: ApprovalCardStep[],
  answers: ChatInteractionAnswer[],
): MessageApproval[] {
  const approvals: MessageApproval[] = [];
  for (const answer of answers) {
    const step = steps.find((s) => s.id === answer.stepId);
    if (!step?.requestId) continue;
    const chosen = step.options?.find((o) => o.label === answer.answer);
    if (!chosen) continue;
    approvals.push({
      requestId: step.requestId,
      decision: chosen.id === "approve" ? "approve" : "deny",
    });
  }
  return approvals;
}
