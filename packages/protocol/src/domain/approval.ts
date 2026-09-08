/**
 * APPROVAL RECEIPTS — how a person's yes/no to a destructive Houston operation
 * travels from the card they clicked to the process that holds the credential.
 *
 * The rule this exists to keep: THE MODEL CANNOT MINT AN APPROVAL. The host
 * issues a `requestId` when it raises an approval card, and the only thing that
 * turns that id into a receipt is a USER message carrying it — which the model
 * has no way to author (assistant messages never travel the host's user-message
 * route, and a routine's unattended turn is fired straight at the runtime,
 * bypassing it entirely).
 *
 * It rides as its OWN field on the send-message request (`approvals`), never
 * inside the message text: the text is the person's words and belongs to them,
 * a marker hidden in it is invisible to every reader that is not looking for it,
 * and anything that must be stripped back out again can be stripped wrongly.
 * The host reads the field off the request, records the receipts, and drops the
 * field before forwarding — so the runtime, the model and the transcript see
 * only what the person actually wrote.
 *
 * Type-only imports would be erased, so this module deliberately has NO imports
 * at all: the app's node:test runner loads it directly by subpath.
 */

/** What the person answered on one approval card. */
export type ApprovalDecision = "approve" | "deny";

/** One card's outcome: the host-issued request it answers, and the answer. */
export interface MessageApproval {
  requestId: string;
  decision: ApprovalDecision;
}

/**
 * The receipts a send-message request carries, validated entry by entry.
 *
 * Tolerant by construction, and fail-closed: anything that is not a well-formed
 * receipt is DROPPED rather than trusted, so an unreadable field approves
 * nothing and the user is asked again. Absence and an empty list are the same
 * answer — no receipts.
 */
export function parseMessageApprovals(value: unknown): MessageApproval[] {
  if (!Array.isArray(value)) return [];
  const approvals: MessageApproval[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const { requestId, decision } = entry as {
      requestId?: unknown;
      decision?: unknown;
    };
    if (typeof requestId !== "string" || requestId === "") continue;
    if (decision !== "approve" && decision !== "deny") continue;
    approvals.push({ requestId, decision });
  }
  return approvals;
}
