import type { CustomEndpoint } from "@houston/protocol";
import type { ChannelCtx } from "../ports";
import { LOCAL_PLACEHOLDER_KEY, OPENAI_COMPATIBLE } from "../providers";
import { customEndpointKey, prefixFor, type TurnDeps } from "../turn/deps";

export async function storeApiKeyCredential(
  deps: TurnDeps,
  ctx: ChannelCtx,
  provider: string,
  apiKey: string,
  endpoint?: string,
): Promise<void> {
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
  await deps.credentials.put({
    workspaceId: ctx.workspace.id,
    provider: OPENAI_COMPATIBLE,
    accessToken: endpoint.apiKey?.trim() || LOCAL_PLACEHOLDER_KEY,
    refreshToken: "",
    expiresAt: 0,
    kind: "api_key",
  });
}
