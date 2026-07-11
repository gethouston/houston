import type {
  CustomEndpoint,
  TunnelCredentials,
} from "../../../../../ui/engine-client/src/types";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * Connect-once: after a device-code connect lands on one agent, capture its
 * credential into the workspace's central store so every agent (existing + new)
 * shares the connection. Idempotent; safe to call on each successful connect.
 */
export async function captureCredential(
  cfg: ControlPlaneConfig,
  agentId: string,
  provider?: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `/agents/${encodeURIComponent(agentId)}/credential/capture`,
    {
      method: "POST",
      ...(provider ? { body: JSON.stringify({ provider }) } : {}),
    },
  );
}

/**
 * Push a desktop-extracted Anthropic OAuth credential to the agent's pod. The
 * body is the `claude` CLI's `.credentials.json` shape (`{claudeAiOauth:{...}}`),
 * already a JSON string; the host stores it centrally and materializes it on the
 * pod PVC. Used ONLY for a REMOTE engine — a hosted pod can't read this machine's
 * Keychain, so the co-located desktop (which shares the credential dir with its
 * local runtime) never calls this. Resolves on 200; throws the host's reason
 * otherwise so the caller can degrade to the paste flow.
 */
export async function pushClaudeOAuthCredential(
  cfg: ControlPlaneConfig,
  agentId: string,
  credentialJson: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `/agents/${encodeURIComponent(agentId)}/credential/claude-oauth`,
    { method: "POST", body: credentialJson },
  );
}

/**
 * Connect-once logout: forget the workspace's central credential for a provider,
 * the mirror of captureCredential. Without it, logout cleared only the agent
 * runtime's local auth.json and the next turn re-served the credential from the
 * central store — so the provider reconnected itself. Idempotent.
 */
export async function forgetCredential(
  cfg: ControlPlaneConfig,
  agentId: string,
  provider: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `/agents/${encodeURIComponent(agentId)}/credential/forget`,
    {
      method: "POST",
      body: JSON.stringify({ provider }),
    },
  );
}

/**
 * Connect an API-key provider (OpenCode Zen / Go): submit the pasted key, which
 * the host stores centrally for the workspace and pushes into the agent runtime.
 * No OAuth dance, no polling — it returns once the key is accepted.
 */
export async function setApiKey(
  cfg: ControlPlaneConfig,
  agentId: string,
  provider: string,
  apiKey: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `/agents/${encodeURIComponent(agentId)}/credential/api-key`,
    {
      method: "POST",
      body: JSON.stringify({ provider, apiKey }),
    },
  );
}

/**
 * Connect an OpenAI-compatible (local) server: the host forwards the endpoint
 * (base URL + model + optional key) to the agent's standing runtime, which
 * persists it. LOCAL-only — a non-local deployment 400s on the openaiCompatible
 * capability, and cpFetch throws the host's error message.
 */
export async function setCustomEndpoint(
  cfg: ControlPlaneConfig,
  agentId: string,
  endpoint: CustomEndpoint,
): Promise<void> {
  await cpFetch(
    cfg,
    `/agents/${encodeURIComponent(agentId)}/provider/openai-compatible`,
    {
      method: "POST",
      body: JSON.stringify(endpoint),
    },
  );
}

/**
 * Mint a short-lived relay credential for the guided "connect a local model"
 * flow (`POST /v1/tunnel/credentials`, Supabase-authed via cpFetch, mirroring
 * `/v1/integrations`). The desktop runs its frpc sidecar against the returned
 * `relayHost:relayPort` so the user's local model server surfaces at `publicUrl`
 * for their cloud agent. Hosted-only — a non-gateway deployment 404s and cpFetch
 * throws the host's real error message (never swallowed).
 */
export async function getTunnelCredentials(
  cfg: ControlPlaneConfig,
): Promise<TunnelCredentials> {
  const res = await cpFetch(cfg, "/v1/tunnel/credentials", { method: "POST" });
  return (await res.json()) as TunnelCredentials;
}

/** Connect-once capture on the setup runtime — `captureCredential`, agentless. */
export async function captureSetupCredential(
  cfg: ControlPlaneConfig,
  provider?: string,
): Promise<void> {
  await cpFetch(cfg, `/setup-runtime/credential/capture`, {
    method: "POST",
    ...(provider ? { body: JSON.stringify({ provider }) } : {}),
  });
}

/** API-key connect on the setup runtime — `setApiKey`, agentless. */
export async function setSetupApiKey(
  cfg: ControlPlaneConfig,
  provider: string,
  apiKey: string,
): Promise<void> {
  await cpFetch(cfg, `/setup-runtime/credential/api-key`, {
    method: "POST",
    body: JSON.stringify({ provider, apiKey }),
  });
}
