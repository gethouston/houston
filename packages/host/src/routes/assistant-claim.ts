import type { AgentId, WorkspaceId } from "../domain/types";
import { ASSISTANT_USER_ID_ENV } from "../launcher/assistant-role";
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
 *   the host must carry the gateway-stamped assistant user identity as well as
 *   the operation credential. An ordinary agent pod has no assistant identity.
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
  if (opts.gatewayFronted) {
    // The gateway stamps the assistant's user id into the pod it provisions for
    // the personal assistant and into NO other pod, so a pod host that carries
    // it is the second factor a fronted deployment has instead of the dot-name:
    // an ordinary agent's pod cannot answer as the coordinator even holding a
    // valid sandbox token for its own runtime.
    if (!process.env[ASSISTANT_USER_ID_ENV]?.trim()) return null;
  } else if (!isAssistantAgentId(claim.agentId)) return null;
  return { workspaceId: claim.workspaceId, agentId: claim.agentId };
}
