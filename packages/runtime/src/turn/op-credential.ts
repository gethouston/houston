import { RemoteCredentialStore } from "@houston/host/src/credentials/remote-store";
import {
  AZURE_OPENAI,
  azureEndpointFileIn,
  normalizeAzureEndpoint,
  setAzureEndpointIn,
} from "../ai/azure-openai";
import {
  QWEN_PROVIDER_ID,
  qwenRegionFileIn,
  setQwenRegionIn,
} from "../ai/qwen-dashscope";
import { assertApiKeyConnectable } from "../auth/login";
import { ApiKeyVerifyError, verifyApiKey } from "../auth/verify-api-key";

/**
 * An API-key connect for a SLEEPING agent, on a pool worker. The pod's path is
 * runtime-verify (a real completion against the provider) → push to the
 * gateway's credential store → the store is what every future turn is served
 * from. The worker does the same two steps with the same code: the verifier
 * is a pure probe, the push is the pod's own RemoteCredentialStore aimed at
 * the gateway with this agent's host token. Two providers persist a small
 * config file BESIDE the key — qwen's verified region and azure's resource
 * endpoint — written into the hydrated agent root (`dataDir`), where the op's
 * sync-back carries them like settings.json. Nothing else touches the
 * worker's disk (auth.json is never synced).
 */
export interface ApiKeyConnect {
  provider: string;
  apiKey: string;
  /** Azure OpenAI's per-resource endpoint, arriving with the key. */
  endpoint?: string;
  /** The hydrated agent runtime dir (region/endpoint files land here). */
  dataDir: string;
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

export async function applyApiKeyConnect(
  opts: ApiKeyConnect,
): Promise<OpAnswer> {
  let key: string;
  try {
    key = assertApiKeyConnectable(opts.provider, opts.apiKey, opts.endpoint);
  } catch (e) {
    return {
      status: 400,
      body: { error: e instanceof Error ? e.message : String(e) },
    };
  }
  try {
    await verifyApiKey(opts.provider, key, {
      // The probe aims at the NORMALIZED endpoint, exactly as the pod does
      // (PRODUCT-1477: a pasted Foundry project URL must be stripped to the
      // host root or the completion 404s and a good key reads as bad).
      ...(opts.provider === AZURE_OPENAI && opts.endpoint
        ? { azureBaseUrl: normalizeAzureEndpoint(opts.endpoint) }
        : {}),
      ...(opts.provider === QWEN_PROVIDER_ID
        ? {
            qwenRegionPersist: (regionId) =>
              setQwenRegionIn(opts.dataDir, regionId),
          }
        : {}),
    });
  } catch (e) {
    // `reason` rides to the connect dialog, which maps it to actionable copy.
    // Nothing persisted: a rejected connect must never clobber the agent's
    // stored (working) endpoint or region.
    return {
      status: 401,
      body: {
        error: e instanceof Error ? e.message : String(e),
        ...(e instanceof ApiKeyVerifyError ? { reason: e.reason } : {}),
      },
    };
  }
  // Endpoint AFTER the verify, BEFORE the key (the pod's own order): only a
  // proven connect persists, and a stored key never aims at nothing. The
  // file rides the op's sync-back beside the region file.
  if (opts.provider === AZURE_OPENAI) {
    setAzureEndpointIn(opts.dataDir, opts.endpoint ?? "");
  }
  const pushed = await pushApiKeyCredential({
    credentialsBaseUrl: opts.credentialsBaseUrl,
    orgSlug: opts.orgSlug,
    agentSlug: opts.agentSlug,
    hostToken: opts.hostToken,
    provider: opts.provider,
    apiKey: key,
    ...(opts.actingAs ? { actingAs: opts.actingAs } : {}),
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
  if (pushed) return pushed;
  return { status: 200, body: { ok: true, provider: opts.provider } };
}

/**
 * Push one verified API key into the gateway's credential store — the store
 * is what every future turn is served from. Returns the pod's own 502 answer
 * on a store failure (no local residue exists on a worker, so nothing to
 * roll back), null on success. Shared by the api-key connect and the
 * openai-compatible endpoint connect (op-endpoint.ts).
 */
export async function pushApiKeyCredential(opts: {
  credentialsBaseUrl: string;
  orgSlug: string;
  agentSlug: string;
  hostToken: string;
  provider: string;
  apiKey: string;
  actingAs?: string;
  fetchImpl?: typeof fetch;
}): Promise<OpAnswer | null> {
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
        // Unused by the remote store (the URL names org + agent); the port's
        // shape requires it.
        workspaceId: opts.orgSlug,
        provider: opts.provider,
        accessToken: opts.apiKey,
        refreshToken: "",
        expiresAt: 0,
        kind: "api_key",
      },
      opts.actingAs ? { actingAs: opts.actingAs } : {},
    );
  } catch (e) {
    return {
      status: 502,
      body: { error: e instanceof Error ? e.message : String(e) },
    };
  }
  return null;
}

/** The runtime-dir files an api-key connect may write beside the key (its
 *  sync-back scope): qwen's verified region, azure's resource endpoint.
 *  Derived from the writers' own path helpers so a rename cannot silently
 *  drop a file from the sync. */
export function credentialOpFiles(dataRel: string): string[] {
  return [qwenRegionFileIn(dataRel), azureEndpointFileIn(dataRel)];
}
