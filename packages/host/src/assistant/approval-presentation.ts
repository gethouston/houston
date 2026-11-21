import type { ApprovalPresentation } from "@houston/protocol/approval";
import type { ApprovalRequest } from "./approval-record";
import type { ApprovalStore } from "./approvals";

const DEFAULT_OPTION_LABELS: Readonly<Record<"approve" | "decline", string>> = {
  approve: "Yes, go ahead",
  decline: "No, don't do it",
};

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
        approval: { operation: card.operation, args: card.args },
      };
    }
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
