import type { ApprovalPresentation } from "@houston/protocol/approval";
import type { ApprovalRequest } from "./approval-record";
import type { ApprovalStore } from "./approvals";

/**
 * The English button copy every shell gets by default.
 *
 * The label belongs to the SURFACE's locale, and every Houston surface replaces
 * these with its own (`app/src/lib/interaction-approval-labels.ts`). They ride
 * the wire anyway because a card is not a card without two readable buttons: a
 * shell with no wording of its own — and any decoder that requires the field —
 * would otherwise render an approval with nothing to press.
 */
const DEFAULT_OPTION_LABELS: Readonly<Record<"approve" | "decline", string>> = {
  approve: "Yes, go ahead",
  decline: "No, don't do it",
};

/**
 * One pending request as a card: WHAT is being approved (the operation and its
 * exact arguments, for a surface to word in the reader's language) plus the
 * host's own English rendering of the same thing.
 */
export function approvalPresentation(
  record: ApprovalRequest,
): ApprovalPresentation {
  return {
    title: record.summary,
    ...(record.detail === undefined ? {} : { detail: record.detail }),
    args: record.args,
    options: [
      { kind: "approval", id: "approve", label: DEFAULT_OPTION_LABELS.approve },
      { kind: "approval", id: "decline", label: DEFAULT_OPTION_LABELS.decline },
    ],
    operation: record.operation,
    expiresAt: record.expiresAt,
  };
}

/**
 * Replace every question claim, including history and nested sync frames.
 *
 * `conversationId` scopes the match to one chat. It is omitted on the activity
 * board, where a card is stored on a mission row rather than in a conversation:
 * the record still has to belong to THIS agent, and a requestId with no live
 * record is stripped either way.
 */
export function substituteApprovals(
  value: unknown,
  store: ApprovalStore,
  agentId: string,
  conversationId?: string,
): unknown {
  if (Array.isArray(value))
    return value.map((entry) =>
      substituteApprovals(entry, store, agentId, conversationId),
    );
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  if (record.kind === "question") {
    const pending =
      typeof record.requestId === "string"
        ? store.pending(record.requestId, agentId, conversationId)
        : undefined;
    if (pending) {
      const card = approvalPresentation(pending);
      return {
        kind: "question",
        id: record.id,
        requestId: pending.requestId,
        question: card.title,
        ...(card.detail === undefined ? {} : { detail: card.detail }),
        options: card.options,
        // The structural account travels WITH the substituted card, so a
        // surface can say it in the reader's language. It is only ever emitted
        // next to a requestId this host issued: a step whose id is unknown
        // loses both, so a runtime cannot smuggle its own `approval` block past
        // this seam and have a shell render it as a Houston approval.
        approval: { operation: card.operation, args: card.args },
      };
    }
    // Neither the receipt id nor the structural account survives without a
    // live record: `approval` is what a surface renders a Houston approval
    // FROM, so a runtime that writes its own next to an unknown id must not
    // keep it either. What is left is an ordinary question, which it may ask.
    const {
      requestId: _untrusted,
      approval: _unauthored,
      ...question
    } = record;
    return Object.fromEntries(
      Object.entries(question).map(([key, child]) => [
        key,
        substituteApprovals(child, store, agentId, conversationId),
      ]),
    );
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      substituteApprovals(child, store, agentId, conversationId),
    ]),
  );
}
