import { RemoteCredentialStore } from "@houston/host/src/credentials/remote-store";
import { assertApiKeyConnectable } from "../auth/login";
import { ApiKeyVerifyError, verifyApiKey } from "../auth/verify-api-key";

/**
 * An API-key connect for a SLEEPING agent, on a pool worker. The pod's path is
 * runtime-verify (a real completion against the provider) → push to the
 * gateway's credential store → the store is what every future turn is served
 * from. The worker does the same two steps with the same code: the verifier
 * is a pure probe, the push is the pod's own RemoteCredentialStore aimed at
 * the gateway with this agent's host token. Nothing is written to the
 * worker's disk (auth.json is never synced, and a worker has no agent of its
 * own).
 */
export interface ApiKeyConnect {
  provider: string;
  apiKey: string;
  /** The gateway's internal base URL (the pod's HOUSTON_CREDENTIALS_URL). */
  credentialsBaseUrl: string;
  orgSlug: string;
  agentSlug: string;
  hostToken: string;
  /** The connecting member's acting-as token (their own row in a team space). */
  actingAs?: string;
  fetchImpl?: typeof fetch;
}

export interface OpAnswer {
  status: number;
  body: unknown;
}

// Qwen keys are REGION-scoped: the verifier persists the accepting region
// beside the key, which on a worker would land in the worker's own dir, not
// the agent's — the next turn could not find it. That one provider keeps the
// pod path.
const WORKER_EXCLUDED_PROVIDERS = new Set(["qwen"]);

export async function applyApiKeyConnect(
  opts: ApiKeyConnect,
): Promise<OpAnswer | { decline: true }> {
  if (WORKER_EXCLUDED_PROVIDERS.has(opts.provider)) return { decline: true };
  let key: string;
  try {
    key = assertApiKeyConnectable(opts.provider, opts.apiKey);
  } catch (e) {
    return {
      status: 400,
      body: { error: e instanceof Error ? e.message : String(e) },
    };
  }
  try {
    await verifyApiKey(opts.provider, key);
  } catch (e) {
    // `reason` rides to the connect dialog, which maps it to actionable copy.
    return {
      status: 401,
      body: {
        error: e instanceof Error ? e.message : String(e),
        ...(e instanceof ApiKeyVerifyError ? { reason: e.reason } : {}),
      },
    };
  }
  const store = new RemoteCredentialStore({
    baseUrl: opts.credentialsBaseUrl,
    orgSlug: opts.orgSlug,
    agentSlug: opts.agentSlug,
    podToken: opts.hostToken,
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
  try {
    await store.put(
      {
        workspaceId: opts.orgSlug,
        provider: opts.provider,
        accessToken: key,
        refreshToken: "",
        expiresAt: 0,
        kind: "api_key",
      },
      opts.actingAs ? { actingAs: opts.actingAs } : {},
    );
  } catch (e) {
    // The key verified but the store did not take it: the pod's own answer
    // for a central-store failure is a 502 with the reason. No local residue
    // exists on a worker, so nothing to roll back.
    return {
      status: 502,
      body: { error: e instanceof Error ? e.message : String(e) },
    };
  }
  return { status: 200, body: { ok: true, provider: opts.provider } };
}
