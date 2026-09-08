import type { ApprovalPresentation } from "@houston/protocol/approval";
import type { ApprovalRequest } from "./approval-record";
import type { ApprovalStore } from "./approvals";

export function approvalPresentation(
  record: ApprovalRequest,
): ApprovalPresentation {
  return {
    title: record.summary,
    ...(record.detail === undefined ? {} : { detail: record.detail }),
    options: [
      { kind: "approval", id: "approve" },
      { kind: "approval", id: "decline" },
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
  if (record.kind === "question" && "requestId" in record) {
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
      };
    }
    const { requestId: _untrusted, ...question } = record;
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
