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
import {
  setXiaomiEndpointIn,
  XIAOMI_PROVIDER_ID,
  xiaomiEndpointFileIn,
} from "../ai/xiaomi-endpoint";
import { assertApiKeyConnectable } from "../auth/login";
import { ApiKeyVerifyError, verifyApiKey } from "../auth/verify-api-key";

export interface ApiKeyConnect {
  provider: string;
  apiKey: string;
  endpoint?: string;
  dataDir: string;
  credentialsBaseUrl: string;
  orgSlug: string;
  agentSlug: string;
  hostToken: string;
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
      ...(opts.provider === AZURE_OPENAI && opts.endpoint
        ? { azureBaseUrl: normalizeAzureEndpoint(opts.endpoint) }
        : {}),
      ...(opts.provider === QWEN_PROVIDER_ID
        ? {
            qwenRegionPersist: (regionId) =>
              setQwenRegionIn(opts.dataDir, regionId),
          }
        : {}),
      ...(opts.provider === XIAOMI_PROVIDER_ID
        ? {
            xiaomiEndpointPersist: (endpointId) =>
              setXiaomiEndpointIn(opts.dataDir, endpointId),
          }
        : {}),
    });
  } catch (e) {
    return {
      status: 401,
      body: {
        error: e instanceof Error ? e.message : String(e),
        ...(e instanceof ApiKeyVerifyError ? { reason: e.reason } : {}),
      },
    };
  }
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
    ...(opts.provider === AZURE_OPENAI && opts.endpoint
      ? { enterpriseUrl: normalizeAzureEndpoint(opts.endpoint) }
      : {}),
    ...(opts.actingAs ? { actingAs: opts.actingAs } : {}),
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
  });
  if (pushed) return pushed;
  return { status: 200, body: { ok: true, provider: opts.provider } };
}

export async function pushApiKeyCredential(opts: {
  credentialsBaseUrl: string;
  orgSlug: string;
  agentSlug: string;
  hostToken: string;
  provider: string;
  apiKey: string;
  enterpriseUrl?: string;
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
        workspaceId: opts.orgSlug,
        provider: opts.provider,
        accessToken: opts.apiKey,
        refreshToken: "",
        expiresAt: 0,
        kind: "api_key",
        ...(opts.enterpriseUrl ? { enterpriseUrl: opts.enterpriseUrl } : {}),
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

export function credentialOpFiles(dataRel: string): string[] {
  return [
    qwenRegionFileIn(dataRel),
    azureEndpointFileIn(dataRel),
    xiaomiEndpointFileIn(dataRel),
  ];
}
