import type { ApprovalArg } from "@houston/protocol/approval";
import type { ApprovalRequest } from "./approval-record";
import type { ApprovalStore } from "./approvals";
import type { GuardReservation } from "./message-guard";

export interface ApprovalCarry {
  requests: ApprovalRequest[];
  reservations: GuardReservation[];
}

export function carryApprovals(
  store: ApprovalStore,
  agentId: string,
  conversationId: string,
): ApprovalCarry {
  return {
    requests: store.requestsFor(agentId, conversationId),
    reservations: store.messages.reservationsFor(agentId, conversationId),
  };
}

export function adoptApprovals(
  store: ApprovalStore,
  carry: unknown,
  scope: { agentId: string; conversationId: string },
): void {
  if (!isRecord(carry)) return;
  const requests = Array.isArray(carry.requests) ? carry.requests : [];
  for (const request of requests) {
    if (
      isApprovalRequest(request) &&
      request.agentId === scope.agentId &&
      request.conversationId === scope.conversationId
    )
      store.adopt(request);
  }
  const reservations = Array.isArray(carry.reservations)
    ? carry.reservations
    : [];
  for (const held of reservations) {
    if (isReservation(held))
      store.messages.adopt(scope.agentId, scope.conversationId, held);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === "string";
const isTime = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function isArg(value: unknown): value is ApprovalArg {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isString(value.value) &&
    typeof value.long === "boolean" &&
    (value.truncated === undefined || isTime(value.truncated))
  );
}

function isApprovalRequest(value: unknown): value is ApprovalRequest {
  return (
    isRecord(value) &&
    isString(value.requestId) &&
    value.requestId !== "" &&
    isString(value.key) &&
    isString(value.operation) &&
    isString(value.agentId) &&
    isString(value.conversationId) &&
    isString(value.summary) &&
    (value.detail === undefined || isString(value.detail)) &&
    Array.isArray(value.args) &&
    value.args.every(isArg) &&
    isTime(value.createdAt) &&
    isTime(value.expiresAt) &&
    (value.decision === undefined ||
      value.decision === "approve" ||
      value.decision === "deny")
  );
}

function isReservation(value: unknown): value is GuardReservation {
  return (
    isRecord(value) &&
    isString(value.nonce) &&
    value.nonce !== "" &&
    isString(value.fingerprint) &&
    isTime(value.expiresAt)
  );
}
