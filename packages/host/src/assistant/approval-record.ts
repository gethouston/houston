import { randomBytes } from "node:crypto";
import type { ApprovalArg } from "@houston/protocol/approval";
import { approvalKey } from "./approval-key";
import { approvalArgs } from "./summary";

export const APPROVAL_TTL_MS = 10 * 60_000;

export type ApprovalDecision = "approve" | "deny";

export interface ApprovalRequest {
  requestId: string;
  key: string;
  operation: string;
  agentId: string;
  conversationId: string;
  summary: string;
  detail?: string;
  args: ApprovalArg[];
  createdAt: number;
  expiresAt: number;
  decision?: ApprovalDecision;
}

export type ApprovalOutcome = "approved" | "denied" | "none";

export interface IssueApprovalInput {
  operation: string;
  params: Record<string, unknown>;
  agentId: string;
  conversationId: string;
  summary: string;
  detail?: string;
}

export interface ConsumeApprovalInput {
  requestId: string;
  operation: string;
  params: Record<string, unknown>;
  agentId: string;
  conversationId: string;
}

export function newApprovalRequest(
  input: IssueApprovalInput,
  at: number,
): ApprovalRequest {
  return {
    requestId: randomBytes(16).toString("hex"),
    key: approvalKey(input.operation, input.params),
    operation: input.operation,
    agentId: input.agentId,
    conversationId: input.conversationId,
    summary: input.summary,
    ...(input.detail ? { detail: input.detail } : {}),
    args: approvalArgs(input.params),
    createdAt: at,
    expiresAt: at + APPROVAL_TTL_MS,
  };
}
