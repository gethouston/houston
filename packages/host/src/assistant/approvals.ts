import {
  type ApprovalDecision,
  type ApprovalOutcome,
  type ApprovalRequest,
  type ConsumeApprovalInput,
  type IssueApprovalInput,
  newApprovalRequest,
} from "./approval-record";
import { authorizesApprovalCall, inApprovalScope } from "./approval-scope";
import { GrantStore } from "./grants";
import { ApprovalMessageGuard } from "./message-guard";

export class ApprovalStore {
  private readonly byId = new Map<string, ApprovalRequest>();
  readonly messages: ApprovalMessageGuard;
  readonly grants: GrantStore;

  constructor(private readonly now: () => number = Date.now) {
    this.messages = new ApprovalMessageGuard(now);
    this.grants = new GrantStore(now);
  }

  issue(input: IssueApprovalInput): ApprovalRequest {
    this.prune();
    const request = newApprovalRequest(input, this.now());
    this.byId.set(request.requestId, request);
    return request;
  }

  pending(
    requestId: string,
    agentId: string,
    conversationId?: string,
  ): ApprovalRequest | undefined {
    this.prune();
    const request = this.byId.get(requestId);
    if (
      !request ||
      request.decision !== undefined ||
      !inApprovalScope(request, agentId, conversationId)
    )
      return undefined;
    return { ...request };
  }

  decide(input: {
    requestId: string;
    agentId: string;
    conversationId: string;
    decision: ApprovalDecision;
  }): boolean {
    this.prune();
    const request = this.byId.get(input.requestId);
    if (
      !request ||
      request.decision !== undefined ||
      !inApprovalScope(request, input.agentId, input.conversationId)
    )
      return false;
    request.decision = input.decision;
    return true;
  }

  retireExcept(agentId: string, conversationId: string, keep: string[]): void {
    const kept = new Set(keep);
    for (const [id, request] of this.byId) {
      if (!kept.has(id) && inApprovalScope(request, agentId, conversationId))
        this.byId.delete(id);
    }
  }

  consume(input: ConsumeApprovalInput): ApprovalOutcome {
    this.prune();
    const request = this.byId.get(input.requestId);
    if (!request || request.decision === undefined) return "none";
    if (!authorizesApprovalCall(request, input)) return "none";
    this.byId.delete(input.requestId);
    return request.decision === "approve" ? "approved" : "denied";
  }

  requestsFor(agentId: string, conversationId: string): ApprovalRequest[] {
    this.prune();
    return [...this.byId.values()]
      .filter((request) => inApprovalScope(request, agentId, conversationId))
      .map((request) => ({ ...request }));
  }

  adopt(request: ApprovalRequest): void {
    if (request.expiresAt > this.now())
      this.byId.set(request.requestId, { ...request });
  }

  clear(agentId?: string, conversationId?: string): void {
    this.messages.clear(agentId, conversationId);
    this.grants.clear(agentId, conversationId);
    if (agentId === undefined) return void this.byId.clear();
    for (const [id, request] of this.byId) {
      if (inApprovalScope(request, agentId, conversationId))
        this.byId.delete(id);
    }
  }

  hasPending(agentId: string, conversationId: string): boolean {
    this.prune();
    return [...this.byId.values()].some((request) =>
      inApprovalScope(request, agentId, conversationId),
    );
  }

  pendingCount(agentId: string): number {
    this.prune();
    let count = 0;
    for (const request of this.byId.values())
      if (inApprovalScope(request, agentId)) count++;
    return count;
  }

  private prune(): void {
    const at = this.now();
    for (const [id, request] of this.byId) {
      if (request.expiresAt <= at) this.byId.delete(id);
    }
  }
}

export const assistantApprovals = new ApprovalStore();
