import { AZURE_OPENAI, normalizeAzureEndpoint } from "../ai/azure-openai";
import { assertApiKeyConnectable, setApiKey } from "../auth/login";
import { ApiKeyVerifyError, verifyApiKey } from "../auth/verify-api-key";
import { json, type RouteContext, readJson } from "./http-helpers";

export async function handleApiKey(ctx: RouteContext, provider: string) {
  let key: string;
  let endpoint: string | undefined;
  try {
    const body = await readJson(ctx.req);
    endpoint = typeof body.endpoint === "string" ? body.endpoint : undefined;
    key = assertApiKeyConnectable(provider, String(body.key || ""), endpoint);
  } catch (e) {
    json(ctx.res, 400, { error: e instanceof Error ? e.message : String(e) });
    return;
  }
  try {
    await verifyApiKey(provider, key, azureVerifyOptions(provider, endpoint));
  } catch (e) {
    json(ctx.res, 401, {
      error: e instanceof Error ? e.message : String(e),
      ...(e instanceof ApiKeyVerifyError ? { reason: e.reason } : {}),
    });
    return;
  }
  setApiKey(provider, key, endpoint);
  json(ctx.res, 200, { ok: true });
}

function azureVerifyOptions(provider: string, endpoint: string | undefined) {
  return provider === AZURE_OPENAI && endpoint
    ? { azureBaseUrl: normalizeAzureEndpoint(endpoint) }
    : undefined;
}
