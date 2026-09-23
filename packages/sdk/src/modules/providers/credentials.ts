/**
 * The per-agent credential writes the HOST serves — `/agents/:id/credential/*`
 * and `/agents/:id/provider/openai-compatible`.
 *
 * TWO PROVIDER WRITE SURFACES EXIST, and both are real. `./writes.ts` reaches
 * the agent's own RUNTIME through `clientFor(agentId)`
 * (`/agents/:id/auth/:provider/api-key`, `/agents/:id/providers/openai-compatible`):
 * those calls land on the pod's local `auth.json`, which is the surface the
 * dispatch-path caller drives, and the only one a LOCAL engine with no gateway
 * in front of it serves. The routes HERE are the gateway/host's connect-once
 * surface: the host stores the credential in the WORKSPACE's central store —
 * which every agent, existing and future, serves from — and pushes it into the
 * standing runtime as a side effect. The web app connects providers that way, so
 * these are the bytes it must keep sending; a write to the runtime twin would
 * leave the central store empty and the next turn would re-hydrate the agent
 * from it, undoing the sign-out or missing the key entirely.
 *
 * NO credential write below carries a scope, in any form (HOU-976). WHOSE
 * account a write lands on is the SERVER's call, decided from the space the
 * request is made in: a team space has no shared AI credential, so the write is
 * the acting member's own; a personal space has exactly one. A client-sent scope
 * could only ever restate what the gateway already knows, or contradict it —
 * `packages/web/tests/credential-write-urls.test.ts` pins these URLs
 * byte-for-byte so no query param can creep back in.
 *
 * Each secret travels in the BODY and never in the path or a query, so nothing
 * here can reach a log line or an error message that carries a URL. Nothing
 * degrades either: every non-2xx throws a `ProvidersHttpError` with the host's
 * reason, because a connect that reported success without storing anything is
 * the one failure the user cannot see.
 */

import type { CustomEndpoint } from "@houston/runtime-client";
import { type HttpScope, httpRequest } from "../http";

/**
 * Saves an agent's provider sign-in so every agent in the workspace can use it.
 *
 * Connect-once: after a device-code connect lands on one agent, capture its
 * credential into the workspace's central store so every agent (existing + new)
 * shares the connection. Idempotent; safe to call on each successful connect.
 * @assistant group:providers hidden: credential plumbing; the device-code connect flow calls it as its own last step.
 * @assistant hands: request_provider_connection
 */
export async function captureCredential(
  scope: HttpScope,
  agentId: string,
  provider?: string,
): Promise<void> {
  await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/credential/capture`,
    {
      method: "POST",
      ...(provider ? { body: JSON.stringify({ provider }) } : {}),
    },
  );
}

/**
 * Sends this computer's Claude sign-in to a cloud agent.
 *
 * Push the desktop's freshly minted Anthropic OAuth credential to the agent's
 * pod. The body is the `claude` CLI's `.credentials.json` shape
 * (`{claudeAiOauth:{...}}`), already a JSON string; the host stores it
 * centrally and materializes it on the pod PVC. Used ONLY for a REMOTE engine
 * — a hosted pod can't read this machine's Keychain, so the co-located desktop
 * (which shares the credential dir with its local runtime) never calls this.
 * Always a fresh mint whose family the gateway will own exclusively — the old
 * `?if_absent=1` fill-only push of a CACHED snapshot is gone with the
 * background reconcile (HOU-950; the host still honors the flag for older
 * clients). Resolves on 200; throws the host's reason otherwise so the caller
 * can degrade to the paste flow.
 *
 * @assistant group:providers confirm: outward. It sends this machine's provider sign-in to a cloud agent, which then holds it.
 * @assistant hidden: carries a secret; the desktop's Anthropic OAuth credential.
 * @assistant hands: request_provider_connection
 */
export async function pushClaudeOAuthCredential(
  scope: HttpScope,
  agentId: string,
  credentialJson: string,
): Promise<void> {
  await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/credential/claude-oauth`,
    { method: "POST", body: credentialJson },
  );
}

/**
 * Signs the workspace out of an AI provider.
 *
 * Connect-once logout: forget the workspace's central credential for a provider,
 * the mirror of captureCredential. Without it, logout cleared only the agent
 * runtime's local auth.json and the next turn re-served the credential from the
 * central store — so the provider reconnected itself. Idempotent.
 *
 * @assistant group:providers confirm: irreversible. Every agent in the workspace loses that sign-in, including the one serving this conversation, and the user has to authenticate with the provider again to get it back.
 */
export async function forgetCredential(
  scope: HttpScope,
  agentId: string,
  provider: string,
): Promise<void> {
  await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/credential/forget`,
    {
      method: "POST",
      body: JSON.stringify({ provider }),
    },
  );
}

/**
 * Connects an AI provider with an API key.
 *
 * Connect an API-key provider (OpenCode Zen / Go): submit the pasted key, which
 * the host stores centrally for the workspace and pushes into the agent runtime.
 * No OAuth dance, no polling — it returns once the key is accepted.
 * @assistant group:providers hidden: takes a secret; the user pastes the provider key themselves.
 * @assistant hands: request_provider_connection
 */
export async function setApiKey(
  scope: HttpScope,
  agentId: string,
  provider: string,
  apiKey: string,
  endpoint?: string,
): Promise<void> {
  await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/credential/api-key`,
    {
      method: "POST",
      body: JSON.stringify({
        provider,
        apiKey,
        ...(endpoint ? { endpoint } : {}),
      }),
    },
  );
}

/**
 * Connects a local or custom AI model server.
 *
 * Connect an OpenAI-compatible (local) server: the host forwards the endpoint
 * (base URL + model + optional key) to the agent's standing runtime, which
 * persists it. LOCAL-only — a non-local deployment 400s on the openaiCompatible
 * capability, and the host's error message surfaces verbatim.
 * @assistant group:providers hidden: takes a secret; the guided local-model setup supplies the server URL and its key.
 * @assistant hands: request_provider_connection
 */
export async function setCustomEndpoint(
  scope: HttpScope,
  agentId: string,
  endpoint: CustomEndpoint,
): Promise<void> {
  await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/provider/openai-compatible`,
    {
      method: "POST",
      body: JSON.stringify(endpoint),
    },
  );
}
