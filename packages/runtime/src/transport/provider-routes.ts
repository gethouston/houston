import { ManagedBridgeEndpointSchema } from "@houston/protocol";
import { refreshEndpointReachability } from "../ai/endpoint-reachability";
import { customEndpointStatus } from "../ai/openai-compatible";
import {
  claimActiveProvider,
  listProviders,
  setSettings,
} from "../ai/providers";
import { listProviderUsage } from "../ai/usage";
import { exportCredential } from "../auth/export";
import { getAuthStatus, setCustomEndpoint } from "../auth/login";
import { scrubRefreshTokens, syncServedCredentialSafe } from "../auth/serve";
import { refreshAnthropicCredential } from "../backends/claude/credential-status";
import { handleApiKeyRollback } from "./api-key-rollback";
import { handleApiKey } from "./api-key-route";
import { handleAuthAction } from "./auth-action-route";
import { handleClaudeOAuthCredential } from "./claude-oauth-route";
import { json, type RouteContext, readJson } from "./http-helpers";

export async function handleProviderRoute(ctx: RouteContext): Promise<boolean> {
  const { method, path, req, res, url } = ctx;

  if (method === "GET" && path === "/providers") {
    await syncServedCredentialSafe("providers");
    await Promise.all([
      refreshAnthropicCredential(),
      refreshEndpointReachability(),
    ]);
    json(res, 200, listProviders());
    return true;
  }
  if (method === "GET" && path === "/providers/usage") {
    await syncServedCredentialSafe("providers-usage");
    await refreshAnthropicCredential();
    json(res, 200, await listProviderUsage());
    return true;
  }
  if (method === "PUT" && path === "/settings") {
    const body = await readJson(req);
    try {
      json(res, 200, setSettings(body));
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }
  if (method === "POST" && path === "/settings/claim") {
    const body = await readJson(req);
    await syncServedCredentialSafe("settings-claim");
    try {
      json(res, 200, claimActiveProvider(String(body.provider || "")));
    } catch (e) {
      json(res, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (method === "GET" && path === "/auth/status") {
    await syncServedCredentialSafe("auth");
    json(res, 200, await getAuthStatus());
    return true;
  }
  if (method === "GET" && path === "/auth/export") {
    const provider = url.searchParams.get("provider") || undefined;
    const excludeServed = url.searchParams.get("excludeServed") === "1";
    json(res, 200, exportCredential(provider, { excludeServed }) ?? {});
    return true;
  }
  if (method === "POST" && path === "/auth/scrub-refresh") {
    const provider = url.searchParams.get("provider");
    if (!provider) {
      json(res, 400, {
        error: "missing 'provider' (the scrub is per-provider)",
      });
      return true;
    }
    json(res, 200, { ok: true, scrubbed: scrubRefreshTokens(provider) });
    return true;
  }
  if (method === "POST" && path === "/providers/openai-compatible") {
    await handleOpenAiCompatible(ctx);
    return true;
  }
  if (method === "GET" && path === "/providers/openai-compatible") {
    json(res, 200, customEndpointStatus());
    return true;
  }
  if (method === "POST" && path === "/auth/anthropic/oauth-credential") {
    await handleClaudeOAuthCredential(ctx);
    return true;
  }

  const apiKeyMatch = path.match(/^\/auth\/([^/]+)\/api-key$/);
  if (method === "POST" && apiKeyMatch) {
    await handleApiKey(ctx, apiKeyMatch[1]);
    return true;
  }
  if (method === "DELETE" && apiKeyMatch) {
    await handleApiKeyRollback(ctx, apiKeyMatch[1]);
    return true;
  }

  const authMatch = path.match(
    /^\/auth\/([^/]+)\/(login|login\/complete|login\/cancel|logout)$/,
  );
  if (method === "POST" && authMatch) {
    await handleAuthAction(ctx, authMatch[1], authMatch[2]);
    return true;
  }

  return false;
}

async function handleOpenAiCompatible(ctx: RouteContext) {
  try {
    const body = await readJson(ctx.req);
    setCustomEndpoint({
      ...(body.bridge !== undefined
        ? { bridge: ManagedBridgeEndpointSchema.parse(body.bridge) }
        : {}),
      baseUrl: String(body.baseUrl || ""),
      model: String(body.model || ""),
      name: typeof body.name === "string" ? body.name : undefined,
      contextWindow:
        typeof body.contextWindow === "number" ? body.contextWindow : undefined,
      reasoning:
        typeof body.reasoning === "boolean" ? body.reasoning : undefined,
      orgShared: body.orgShared === true ? true : undefined,
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
    });
    json(ctx.res, 200, { ok: true });
  } catch (e) {
    json(ctx.res, 400, { error: e instanceof Error ? e.message : String(e) });
  }
}
