import { AZURE_OPENAI, normalizeAzureEndpoint } from "../ai/azure-openai";
import { assertApiKeyConnectable, setApiKey } from "../auth/login";
import { ApiKeyVerifyError, verifyApiKey } from "../auth/verify-api-key";
import { json, type RouteContext, readJson } from "./http-helpers";

/**
 * API-key connect: cheap preconditions first (clean 400), then a LIVE
 * verification request with the candidate key (verify-api-key.ts), and only
 * then the store. A key the provider rejects is a 401 and never persists —
 * "connected" must mean the key actually works, not merely that a string was
 * pasted.
 */
export async function handleApiKey(ctx: RouteContext, provider: string) {
  let key: string;
  let endpoint: string | undefined;
  try {
    const body = await readJson(ctx.req);
    // Azure OpenAI carries its per-resource endpoint alongside the key
    // (PRODUCT-1477); other providers ignore the field.
    endpoint = typeof body.endpoint === "string" ? body.endpoint : undefined;
    key = assertApiKeyConnectable(provider, String(body.key || ""), endpoint);
  } catch (e) {
    json(ctx.res, 400, { error: e instanceof Error ? e.message : String(e) });
    return;
  }
  try {
    await verifyApiKey(provider, key, azureVerifyOptions(provider, endpoint));
  } catch (e) {
    // `reason` rides the body to the connect dialog, which maps it to
    // actionable copy (bad key vs restricted key vs provider outage).
    json(ctx.res, 401, {
      error: e instanceof Error ? e.message : String(e),
      ...(e instanceof ApiKeyVerifyError ? { reason: e.reason } : {}),
    });
    return;
  }
  setApiKey(provider, key, endpoint);
  json(ctx.res, 200, { ok: true });
}

/**
 * Aim the verify probe at the pasted Azure endpoint. Explicit (never the
 * stored overlay): at connect time nothing is persisted yet, and a re-connect
 * must verify against the NEW endpoint, not last time's.
 */
function azureVerifyOptions(provider: string, endpoint: string | undefined) {
  return provider === AZURE_OPENAI && endpoint
    ? { azureBaseUrl: normalizeAzureEndpoint(endpoint) }
    : undefined;
}
