import { coordinatorScope } from "../assistant/coordinator-scope";
import type { AgentId, WorkspaceId } from "../domain/types";
import { ASSISTANT_USER_ID_ENV } from "../launcher/assistant-role";
import type { CredentialVault } from "../ports";
import { ASSISTANT_AGENT_NAME } from "./assistant";

export interface AssistantClaim {
  workspaceId: WorkspaceId;
  agentId: AgentId;
}

export function isAssistantAgentId(agentId: AgentId): boolean {
  const name = agentId.slice(agentId.lastIndexOf("/") + 1);
  return name === ASSISTANT_AGENT_NAME;
}

export function assistantClaim(
  vault: CredentialVault,
  token: string | null | undefined,
  opts: { gatewayFronted?: boolean } = {},
): AssistantClaim | null {
  const claim = token ? vault.validateSandboxToken(token) : null;
  if (!claim) return null;
  if (opts.gatewayFronted) {
    if (!coordinatorScope() && !process.env[ASSISTANT_USER_ID_ENV]?.trim())
      return null;
  } else if (!isAssistantAgentId(claim.agentId)) return null;
  return { workspaceId: claim.workspaceId, agentId: claim.agentId };
}
