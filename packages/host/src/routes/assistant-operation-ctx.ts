import type { ApprovalStore } from "../assistant/approvals";
import type { AssistantCatalog } from "../assistant/catalog";
import { gatewayAgentSlug } from "../assistant/coordinator-scope";
import type { EntityDirectory } from "../assistant/entity-directory";
import { gatewayEntityDirectory } from "../assistant/entity-directory-gateway";
import { localEntityDirectory } from "../assistant/entity-directory-local";
import type { AssistantClaim } from "./assistant-claim";
import type { AssistantGateway } from "./assistant-forward";
import type { AssistantSandboxDeps } from "./assistant-sandbox-deps";
import type { ReachableAgent } from "./reachable-agents";

export interface AssistantOperationCtx {
  catalog: AssistantCatalog;
  approvals: ApprovalStore;
  agentId: string;
  gatewayFronted?: boolean;
  gatewayAgentId?: string;
  conversationId: string | undefined;
  unserved: ReadonlySet<string>;
  agents(): Promise<readonly ReachableAgent[]>;
  directory: EntityDirectory;
  persistApprovals?: () => Promise<void>;
}

export interface AssistantCallInput {
  operation: string;
  params: Record<string, unknown>;
  requestId: string | undefined;
  actingAs: string | undefined;
  gateway: AssistantGateway;
  fetchImpl: typeof fetch;
}

export function assistantOperationDirectory(
  deps: AssistantSandboxDeps,
  claim: AssistantClaim,
  gateway: AssistantGateway,
  actingAs: string | undefined,
): EntityDirectory {
  return deps.gatewayFronted
    ? gatewayEntityDirectory({
        gateway,
        agentId: claim.agentId,
        gatewayAgentId: gatewayAgentSlug(),
        actingAs,
        fetchImpl: deps.fetchImpl,
      })
    : localEntityDirectory({ ...deps, ...claim });
}
