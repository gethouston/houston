import type { AgentId, WorkspaceId } from "../domain/types";
import type { CredentialVault } from "../ports";
import { ASSISTANT_AGENT_NAME } from "./assistant";

/**
 * WHICH sandbox may drive Houston operations.
 *
 * Every agent on a desktop carries a valid sandbox token, so authenticating one
 * is not the same as authorizing it: without this check any agent could post
 * `deleteAgent` to `/sandbox/assistant/call` and the host would perform it with
 * the gateway credential. The personal assistant is the ONLY agent those routes
 * exist for, so the claim is scoped to it the way every other `/sandbox/*` route
 * scopes to the claim it decoded.
 *
 * Two deployment shapes, one rule (WHO the credential was handed to):
 * - DESKTOP / SELF-HOST: one host serves every agent, so the claim must name the
 *   synthetic `.assistant` agent (`routes/assistant.ts`) and nothing else.
 * - GATEWAY-FRONTED (a managed cloud pod): the pod holds exactly ONE agent and
 *   the gateway stamped this pod's operation credential deliberately, so the
 *   only claim this host can decode already IS the agent it was granted for.
 */

export interface AssistantClaim {
  workspaceId: WorkspaceId;
  agentId: AgentId;
}

/** True when this agent id names the personal assistant's synthetic agent. */
export function isAssistantAgentId(agentId: AgentId): boolean {
  const name = agentId.slice(agentId.lastIndexOf("/") + 1);
  return name === ASSISTANT_AGENT_NAME;
}

/**
 * The verified assistant claim, or null when the token is absent, invalid, or
 * belongs to an agent that is not the assistant. Fail closed on every branch:
 * the caller answers 401/403 and performs nothing.
 */
export function assistantClaim(
  vault: CredentialVault,
  token: string | null | undefined,
  opts: { gatewayFronted?: boolean } = {},
): AssistantClaim | null {
  const claim = token ? vault.validateSandboxToken(token) : null;
  if (!claim) return null;
  if (!opts.gatewayFronted && !isAssistantAgentId(claim.agentId)) return null;
  return { workspaceId: claim.workspaceId, agentId: claim.agentId };
}
