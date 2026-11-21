import { RemoteSharedEndpointStore } from "@houston/host/src/credentials/remote-shared-endpoint-store";
import { checkPublicHttpsEndpoint } from "@houston/host/src/custom-endpoint-validation";
import {
  OPENAI_COMPATIBLE,
  setCustomEndpointConfigIn,
} from "../ai/openai-compatible";
import { LOCAL_PLACEHOLDER_KEY } from "../auth/login";
import { type OpAnswer, pushApiKeyCredential } from "./op-credential";
import type { OpRequest } from "./parse-op-request";

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
  const baseUrl = input.baseUrl.trim();
  const descriptor = {
    ...(input.bridge ? { bridge: input.bridge } : {}),
    baseUrl,
    model: input.model.trim(),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.contextWindow !== undefined
      ? { contextWindow: input.contextWindow }
      : {}),
    ...(input.reasoning !== undefined ? { reasoning: input.reasoning } : {}),
  };
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
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

  try {
    setCustomEndpointConfigIn(deps.dataDir, descriptor);
  } catch (e) {
    return {
      status: 400,
      body: { error: e instanceof Error ? e.message : String(e) },
    };
  }
  const pushed = await pushApiKeyCredential({
    credentialsBaseUrl: deps.credentialsBaseUrl,
    orgSlug: deps.orgSlug,
    agentSlug: deps.agentSlug,
    hostToken: op.hostToken,
    provider: OPENAI_COMPATIBLE,
    apiKey: input.apiKey?.trim() || LOCAL_PLACEHOLDER_KEY,
    ...(op.actingToken ? { actingAs: op.actingToken } : {}),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  });
  if (pushed) return pushed;
  try {
    const shared = new RemoteSharedEndpointStore({
      baseUrl: deps.credentialsBaseUrl,
      orgSlug: deps.orgSlug,
      agentSlug: deps.agentSlug,
      podToken: op.hostToken,
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    });
    if (input.shared === true) {
      await shared.put(
        {
          ...descriptor,
          ...(input.apiKey !== undefined ? { apiKey: input.apiKey } : {}),
        },
        op.actingToken,
      );
    } else {
      await shared.remove({ ownerOnly: true });
    }
  } catch (e) {
    console.error("[shared-endpoint] save synchronization failed:", e);
    return {
      status: 502,
      body: { error: e instanceof Error ? e.message : String(e) },
    };
  }
  return { status: 200, body: { ok: true } };
}
