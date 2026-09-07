import { type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * SETUP-RUNTIME credential writes (`/setup-runtime/credential/*`): the agentless
 * mirrors of the per-agent writes in `credentials.ts`, for the flows that land
 * before any agent exists. They carry no scope either — the space the request
 * lands in decides whose account the write hits.
 */

/**
 * Sends this computer's Claude sign-in to the workspace before any agent exists.
 *
 * Claude OAuth push on the setup runtime — `pushClaudeOAuthCredential`,
 * agentless. Used when the desktop's browser login lands with NO agent
 * selected yet (first-run onboarding, the cloud-migration wizard): the setup
 * runtime stores it on the personal workspace, so every agent created or
 * migrated after is already connected.
 * @assistant group:providers hidden
 */
export async function pushSetupClaudeOAuthCredential(
  cfg: ControlPlaneConfig,
  credentialJson: string,
): Promise<void> {
  await cpFetch(cfg, `/setup-runtime/credential/claude-oauth`, {
    method: "POST",
    body: credentialJson,
  });
}

/**
 * Saves a provider sign-in to the workspace before any agent exists.
 *
 * Connect-once capture on the setup runtime — `captureCredential`, agentless.
 * @assistant group:providers hidden
 */
export async function captureSetupCredential(
  cfg: ControlPlaneConfig,
  provider?: string,
): Promise<void> {
  await cpFetch(cfg, `/setup-runtime/credential/capture`, {
    method: "POST",
    ...(provider ? { body: JSON.stringify({ provider }) } : {}),
  });
}

/**
 * Connects an AI provider with an API key before any agent exists.
 *
 * API-key connect on the setup runtime — `setApiKey`, agentless.
 * @assistant group:providers hidden
 */
export async function setSetupApiKey(
  cfg: ControlPlaneConfig,
  provider: string,
  apiKey: string,
  endpoint?: string,
): Promise<void> {
  await cpFetch(cfg, `/setup-runtime/credential/api-key`, {
    method: "POST",
    body: JSON.stringify({
      provider,
      apiKey,
      ...(endpoint ? { endpoint } : {}),
    }),
  });
}

/**
 * Forget a workspace-central credential without any agent.
 *
 * A space with no agent (first-run before the assistant exists, a failed first
 * create, a deleted last agent) still holds the credential the user connected;
 * the setup runtime is the one runtime that can forget it (PRODUCT-1662).
 *
 * @assistant hidden
 */
export async function forgetSetupCredential(
  cfg: ControlPlaneConfig,
  provider: string,
): Promise<void> {
  await cpFetch(cfg, `/setup-runtime/credential/forget`, {
    method: "POST",
    body: JSON.stringify({ provider }),
  });
}
