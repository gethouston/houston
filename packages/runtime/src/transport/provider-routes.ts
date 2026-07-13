import { parseClaudeOAuthEnvelope } from "@houston/runtime-client";
import { customEndpointStatus } from "../ai/openai-compatible";
import {
  claimActiveProvider,
  listProviders,
  setSettings,
} from "../ai/providers";
import { listProviderUsage } from "../ai/usage";
import { exportCredential } from "../auth/export";
import {
  cancelLogin,
  completeLogin,
  getAuthStatus,
  logout,
  setApiKey,
  setCustomEndpoint,
  startLogin,
} from "../auth/login";
import { scrubRefreshTokens, syncServedCredentialSafe } from "../auth/serve";
import { refreshAnthropicCredential } from "../backends/claude/credential-status";
import { writeClaudeOAuthCredentialFile } from "../backends/claude/credentials-file";
import { claudeLoginConfigDir } from "../backends/claude/paths";
import { json, type RouteContext, readJson } from "./http-helpers";

export async function handleProviderRoute(ctx: RouteContext): Promise<boolean> {
  const { method, path, req, res, url } = ctx;

  if (method === "GET" && path === "/providers") {
    await syncServedCredentialSafe("providers");
    // Warm the anthropic shared-dir credential probe so a just-completed browser
    // login flips `configured` on this poll (the card-status path goes through
    // /providers, not /auth/status). listProviders() then reads the fresh cache.
    await refreshAnthropicCredential();
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
    json(res, 200, exportCredential(provider) ?? {});
    return true;
  }
  if (method === "POST" && path === "/auth/scrub-refresh") {
    json(res, 200, { ok: true, scrubbed: scrubRefreshTokens() });
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

/**
 * Materialize a desktop-pushed Claude subscription OAuth credential (host→pod).
 * Writes the CLI's `<CLAUDE_CONFIG_DIR>/.credentials.json` so the Claude Agent
 * SDK + `claude auth status` read as logged-in and the SDK self-refreshes from
 * the refresh token in place. The body is the pinned CLI envelope, validated
 * STRICTLY — a malformed push is a clear 400 (the desktop falls back to paste),
 * a write failure a 500. On success the connected signal is warmed so status
 * flips immediately. The token is never logged.
 */
async function handleClaudeOAuthCredential(ctx: RouteContext) {
  const parsed = parseClaudeOAuthEnvelope(
    await readJson(ctx.req).catch(() => ({})),
  );
  if (!parsed.ok) {
    json(ctx.res, 400, { error: parsed.error });
    return;
  }
  try {
    writeClaudeOAuthCredentialFile(claudeLoginConfigDir(), parsed.value);
  } catch (e) {
    json(ctx.res, 500, {
      error: `could not materialize the Claude credential: ${e instanceof Error ? e.message : String(e)}`,
    });
    return;
  }
  // Warm the shared-dir credential probe so `configured` / `claude auth status`
  // flips connected on the very next poll instead of after the cache TTL.
  await refreshAnthropicCredential(undefined, { force: true });
  json(ctx.res, 200, { ok: true });
}

async function handleApiKey(ctx: RouteContext, provider: string) {
  try {
    const { key } = await readJson(ctx.req);
    setApiKey(provider, String(key || ""));
    json(ctx.res, 200, { ok: true });
  } catch (e) {
    json(ctx.res, 400, { error: e instanceof Error ? e.message : String(e) });
  }
}

async function handleAuthAction(
  ctx: RouteContext,
  provider: string,
  action: string,
) {
  try {
    if (action === "login") {
      const deviceAuth = ctx.url.searchParams.get("deviceAuth") !== "false";
      const enterpriseDomain =
        ctx.url.searchParams.get("enterpriseDomain") || undefined;
      json(
        ctx.res,
        200,
        await startLogin(provider, deviceAuth, enterpriseDomain),
      );
      return;
    }
    if (action === "login/complete") {
      const { code } = await readJson(ctx.req);
      completeLogin(provider, String(code || ""));
      json(ctx.res, 200, { ok: true });
      return;
    }
    if (action === "login/cancel") {
      cancelLogin(provider);
      json(ctx.res, 200, { ok: true });
      return;
    }
    await logout(provider);
    json(ctx.res, 200, { ok: true });
  } catch (e) {
    json(ctx.res, 400, { error: e instanceof Error ? e.message : String(e) });
  }
}
