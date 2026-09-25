import type { CustomEndpoint } from "@houston/protocol";
import type { ChannelCtx } from "../ports";
import { LOCAL_PLACEHOLDER_KEY, OPENAI_COMPATIBLE } from "../providers";
import { customEndpointKey, prefixFor, type TurnDeps } from "../turn/deps";

/**
 * Central credential writes for the per-turn channel (TurnChannel). There is
 * no standing runtime to push to: the per-turn runtime receives every
 * credential baked into the next POST /turn (start-turn), and auth status reads
 * it straight from the central store (dispatchCloudrun).
 */
export async function storeApiKeyCredential(
  deps: TurnDeps,
  ctx: ChannelCtx,
  provider: string,
  apiKey: string,
  endpoint?: string,
): Promise<void> {
  // Azure OpenAI's per-resource endpoint rides the credential row's
  // non-secret enterpriseUrl slot (PRODUCT-1532): the per-turn runtime
  // receives it baked into each POST /turn and lands it in the turn's data
  // dir (execute-turn), so the key is never stored aimed at nothing.
  await deps.credentials.put({
    workspaceId: ctx.workspace.id,
    provider,
    accessToken: apiKey,
    refreshToken: "",
    expiresAt: 0,
    kind: "api_key",
    ...(endpoint ? { enterpriseUrl: endpoint } : {}),
  });
}

/**
 * The per-turn runtime hydrates its data dir from the agent's object-storage
 * prefix at the start of each turn, so writing `custom-endpoint.json` under the
 * SAME key/schema the runtime reads (packages/runtime/src/ai/openai-compatible.ts)
 * is what a later turn picks up. The endpoint (base URL + model) rides that
 * hydrated file; the matching AUTH rides a central credential, served per turn.
 */
export async function storeCustomEndpoint(
  deps: TurnDeps,
  ctx: ChannelCtx,
  endpoint: CustomEndpoint,
): Promise<void> {
  const stored = {
    baseUrl: endpoint.baseUrl,
    model: endpoint.model,
    name: endpoint.name,
    contextWindow: endpoint.contextWindow,
    reasoning: endpoint.reasoning,
  };
  await deps.vfs.writeText(
    customEndpointKey(prefixFor(ctx.workspace, ctx.agent)),
    JSON.stringify(stored, null, 2),
  );
  // The per-turn runtime authenticates the endpoint from a SERVED credential:
  // dispatchTurn → freshCredential(ws, "openai-compatible") → the runtime's
  // applyServedCredential writes auth.json, where pi reads the key by
  // model.provider. The user's key, or the keyless placeholder, is stored as an
  // api_key credential (never expires, no refresh). WITHOUT it every turn
  // hard-errors "No provider connected", and the endpoint's key must never sit
  // in the hydrated custom-endpoint.json (that file is not auth).
  await deps.credentials.put({
    workspaceId: ctx.workspace.id,
    provider: OPENAI_COMPATIBLE,
    accessToken: endpoint.apiKey?.trim() || LOCAL_PLACEHOLDER_KEY,
    refreshToken: "",
    expiresAt: 0,
    kind: "api_key",
  });
}
