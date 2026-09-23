/**
 * The typed facade over the WORKSPACE-CENTRAL credential store — the
 * connect-once surface the gateway/host serves, per agent (`./credentials`) and
 * agentless (`./setup-credentials`).
 *
 * SEAM — these are host CONTROL routes about an agent, not calls into its
 * sandbox, so they run on this module's own {@link moduleScope} rooted at the
 * base URL and never `clientFor(agentId)`. That is the whole difference from
 * `./writes.ts`, which drives the agent's own runtime (`/agents/:id/auth/*`)
 * and is what a LOCAL engine with no gateway in front of it serves. Both
 * surfaces are load-bearing: `./writes.ts` writes the pod's `auth.json`, this
 * module writes the store every agent in the space serves from, and the host
 * pushes into the runtime as a side effect.
 *
 * NOT registered as commands. Every call here carries a credential the person
 * pasted or their machine minted, and a command is a JSON `dispatch` envelope —
 * a secret must never travel one. The app owns this surface directly.
 */

import type { CustomEndpoint } from "@houston/runtime-client";
import type { ModuleContext } from "../../module-context";
import { moduleScope, SdkHttpError } from "../http";
import {
  captureCredential,
  forgetCredential,
  pushClaudeOAuthCredential,
  setApiKey,
  setCustomEndpoint,
} from "./credentials";
import {
  captureSetupCredential,
  forgetSetupCredential,
  pushSetupClaudeOAuthCredential,
  setSetupApiKey,
} from "./setup-credentials";

/** A failed credential-store request. `status` is the upstream HTTP status. */
export class ProvidersHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "ProvidersHttpError");
  }
}

/**
 * Writes against the workspace's central credential store. Nothing degrades:
 * every non-2xx throws a {@link ProvidersHttpError} carrying its status, and the
 * surface decides what that means for it.
 */
export interface ProviderCredentialWrites {
  /** Capture the agent's just-connected credential for the whole workspace. */
  captureCredential(agentId: string, provider?: string): Promise<void>;
  /** Push the desktop's Anthropic OAuth credential to the agent's pod. */
  pushClaudeOAuthCredential(
    agentId: string,
    credentialJson: string,
  ): Promise<void>;
  /** Drop the workspace credential so no future turn can re-serve it. */
  forgetCredential(agentId: string, provider: string): Promise<void>;
  /** Store a pasted API key centrally and push it into the agent's runtime. */
  setApiKey(
    agentId: string,
    provider: string,
    apiKey: string,
    endpoint?: string,
  ): Promise<void>;
  /** Connect an OpenAI-compatible server through the host. LOCAL profile only. */
  setCustomEndpoint(agentId: string, endpoint: CustomEndpoint): Promise<void>;
  /** The Claude OAuth push, before the space has any agent. */
  pushSetupClaudeOAuthCredential(credentialJson: string): Promise<void>;
  /** The connect-once capture, before the space has any agent. */
  captureSetupCredential(provider?: string): Promise<void>;
  /** The API-key connect, before the space has any agent. */
  setSetupApiKey(
    provider: string,
    apiKey: string,
    endpoint?: string,
  ): Promise<void>;
  /** The central-credential forget, for a space with no agent to route through. */
  forgetSetupCredential(provider: string): Promise<void>;
}

export function createProviderCredentials(
  ctx: ModuleContext,
): ProviderCredentialWrites {
  const scope = moduleScope(ctx, "providers", ProvidersHttpError);
  return {
    captureCredential: (agentId, provider) =>
      captureCredential(scope, agentId, provider),
    pushClaudeOAuthCredential: (agentId, credentialJson) =>
      pushClaudeOAuthCredential(scope, agentId, credentialJson),
    forgetCredential: (agentId, provider) =>
      forgetCredential(scope, agentId, provider),
    setApiKey: (agentId, provider, apiKey, endpoint) =>
      setApiKey(scope, agentId, provider, apiKey, endpoint),
    setCustomEndpoint: (agentId, endpoint) =>
      setCustomEndpoint(scope, agentId, endpoint),
    pushSetupClaudeOAuthCredential: (credentialJson) =>
      pushSetupClaudeOAuthCredential(scope, credentialJson),
    captureSetupCredential: (provider) =>
      captureSetupCredential(scope, provider),
    setSetupApiKey: (provider, apiKey, endpoint) =>
      setSetupApiKey(scope, provider, apiKey, endpoint),
    forgetSetupCredential: (provider) => forgetSetupCredential(scope, provider),
  };
}
