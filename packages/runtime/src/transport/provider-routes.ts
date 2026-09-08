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
    // Warm the cached health signals listProviders() reads synchronously: the
    // anthropic shared-dir credential probe (so a just-completed browser login
    // flips `configured` on this poll — the card-status path goes through
    // /providers, not /auth/status) and the local endpoint's reachability
    // probe (so a stopped Ollama/LM Studio server stops offering its model).
    await Promise.all([
      refreshAnthropicCredential(),
      refreshEndpointReachability(),
    ]);
    json(res, 200, listProviders());
    return true;
  }
  // Per-account usage (rate-limit windows / balances) for every CONNECTED
  // provider, fetched live from each provider's own usage API. Registered
  // before the generic /providers/* matchers as a literal path.
  if (method === "GET" && path === "/providers/usage") {
    await syncServedCredentialSafe("providers-usage");
    // Warm the anthropic shared-dir probe so a just-connected Claude account
    // counts as connected on this poll (same rationale as GET /providers).
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
  // Connect-flow claim: make the just-connected provider active ONLY when the
  // agent doesn't already resolve to one. A credential connect must never move
  // an existing chat off its provider (HOU-695) — that's the model picker's
  // job (PUT /settings). Served credentials are hydrated first so "already
  // connected" includes the workspace's connect-once credentials.
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
    // The serve healer's local-origin contract (PRODUCT-1370): an AUTOMATIC
    // capture must not export a serve-written api_key projection — re-pushing
    // it would resurrect a credential the user disconnected centrally.
    const excludeServed = url.searchParams.get("excludeServed") === "1";
    json(res, 200, exportCredential(provider, { excludeServed }) ?? {});
    return true;
  }
  if (method === "POST" && path === "/auth/scrub-refresh") {
    // Provider-scoped (PRODUCT-1320): a whole-file scrub let one provider's
    // capture erase another's mid-capture refresh token. The host always knows
    // which provider it just captured, so a scrub without one is a bug.
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
  // The host's rollback when its central store rejected a key the POST above
  // had already verified + persisted (PRODUCT-1321) — see api-key-rollback.ts.
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
