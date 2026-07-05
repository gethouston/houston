import { listProviders, setSettings } from "../ai/providers";
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
import { json, type RouteContext, readJson } from "./http-helpers";

export async function handleProviderRoute(ctx: RouteContext): Promise<boolean> {
  const { method, path, req, res, url } = ctx;

  if (method === "GET" && path === "/providers") {
    await syncServedCredentialSafe("providers");
    json(res, 200, listProviders());
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

  if (method === "GET" && path === "/auth/status") {
    await syncServedCredentialSafe("auth");
    json(res, 200, getAuthStatus());
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
      apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
    });
    json(ctx.res, 200, { ok: true });
  } catch (e) {
    json(ctx.res, 400, { error: e instanceof Error ? e.message : String(e) });
  }
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
    logout(provider);
    json(ctx.res, 200, { ok: true });
  } catch (e) {
    json(ctx.res, 400, { error: e instanceof Error ? e.message : String(e) });
  }
}
