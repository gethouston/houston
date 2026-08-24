import { RemoteSharedEndpointStore } from "@houston/host/src/credentials/remote-shared-endpoint-store";
import { RemoteCredentialStore } from "@houston/host/src/credentials/remote-store";
import { checkPublicHttpsEndpoint } from "@houston/host/src/custom-endpoint-validation";
import {
  OPENAI_COMPATIBLE,
  setCustomEndpointConfigIn,
} from "../ai/openai-compatible";
import { LOCAL_PLACEHOLDER_KEY } from "../auth/login";
import type { OpAnswer } from "./op-credential";
import type { OpRequest } from "./parse-op-request";

/**
 * Connect an OpenAI-compatible endpoint for a SLEEPING agent, on a pool
 * worker — the pod handler's own steps against the hydrated root: validate
 * the URL against the managed-cloud egress policy, persist the endpoint
 * config (`custom-endpoint.json`, riding the settings sync-back), push the
 * key (placeholder for a keyless server) to the gateway's credential store —
 * auth.json never syncs, and turn workers fetch this provider's key from the
 * store like any other — then publish/withdraw the org share.
 *
 * Ops exist only behind the managed gateway, so the public-HTTPS egress
 * check always applies here; the dev launcher's loopback "pods" keep the
 * proxy path for their localhost endpoints (a worker would 400 them).
 */
export async function applyEndpointConnect(
  op: OpRequest & {
    op: Extract<OpRequest["op"], { kind: "settings"; action: "endpoint" }>;
  },
  deps: {
    dataDir: string;
    credentialsBaseUrl: string;
    orgSlug: string;
    agentSlug: string;
    fetchImpl?: typeof fetch;
  },
): Promise<OpAnswer> {
  const input = op.op.input;
  let parsed: URL;
  try {
    parsed = new URL(input.baseUrl);
  } catch {
    return { status: 400, body: { error: "baseUrl is not a valid URL" } };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      status: 400,
      body: { error: "baseUrl must start with http:// or https://" },
    };
  }
  const check = checkPublicHttpsEndpoint(parsed);
  if (!check.ok) return { status: 400, body: { error: check.reason } };

  // Endpoint FIRST (the pod's own order): a bad config must never leave a
  // stored key aimed at nothing.
  try {
    setCustomEndpointConfigIn(deps.dataDir, {
      baseUrl: input.baseUrl,
      model: input.model,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.contextWindow !== undefined
        ? { contextWindow: input.contextWindow }
        : {}),
      ...(input.reasoning !== undefined ? { reasoning: input.reasoning } : {}),
    });
  } catch (e) {
    return {
      status: 400,
      body: { error: e instanceof Error ? e.message : String(e) },
    };
  }
  const common = {
    baseUrl: deps.credentialsBaseUrl,
    orgSlug: deps.orgSlug,
    agentSlug: deps.agentSlug,
    podToken: op.hostToken,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  };
  try {
    await new RemoteCredentialStore(common).put(
      {
        workspaceId: deps.orgSlug,
        provider: OPENAI_COMPATIBLE,
        accessToken: input.apiKey?.trim() || LOCAL_PLACEHOLDER_KEY,
        refreshToken: "",
        expiresAt: 0,
        kind: "api_key",
      },
      op.actingToken ? { actingAs: op.actingToken } : {},
    );
    const shared = new RemoteSharedEndpointStore(common);
    if (input.shared === true) {
      await shared.put({
        baseUrl: input.baseUrl,
        model: input.model,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.contextWindow !== undefined
          ? { contextWindow: input.contextWindow }
          : {}),
        ...(input.reasoning !== undefined
          ? { reasoning: input.reasoning }
          : {}),
        ...(input.apiKey !== undefined ? { apiKey: input.apiKey } : {}),
      });
    } else {
      await shared.remove({ ownerOnly: true });
    }
  } catch (e) {
    // The endpoint config is already written (the pod logs and answers 502
    // the same way when its share sync fails after the save).
    console.error("[shared-endpoint] save synchronization failed:", e);
    return {
      status: 502,
      body: { error: e instanceof Error ? e.message : String(e) },
    };
  }
  return { status: 200, body: { ok: true } };
}
