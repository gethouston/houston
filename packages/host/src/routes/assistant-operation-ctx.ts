import type { ApprovalStore } from "../assistant/approvals";
import type { AssistantCatalog } from "../assistant/catalog";
import type { AssistantGateway } from "./assistant-forward";
import type { ReachableAgent } from "./reachable-agents";

/**
 * What the two `/sandbox/assistant/*` handlers (assistant-operate.ts) and the
 * receipt gate (assistant-approval-gate.ts) both work from. Held here so the
 * gate and the handlers share one declaration instead of importing each other.
 */

/** Everything both handlers need, resolved once by the route. */
export interface AssistantOperationCtx {
  catalog: AssistantCatalog;
  approvals: ApprovalStore;
  agentId: string;
  /** The calling turn's conversation. Absent = nowhere for an answer to arrive. */
  conversationId: string | undefined;
  /** Every agent this caller may address, for resolving the identifiers an
   *  operation's parameters name (`assistant/entity-resolution.ts`). */
  agents(): Promise<readonly ReachableAgent[]>;
}

export interface AssistantCallInput {
  operation: string;
  params: Record<string, unknown>;
  /** The receipt the user minted for this exact call, when there is one. */
  requestId: string | undefined;
  actingAs: string | undefined;
  gateway: AssistantGateway;
  fetchImpl: typeof fetch;
}
