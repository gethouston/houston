import type { IncomingMessage, ServerResponse } from "node:http";
import { isExpiring, refreshCredential } from "../credentials/refresh";
import {
  type CredentialStore,
  type CredentialVault,
  isApiKeyCredential,
} from "../ports";
import { bearer, json } from "./http";

/**
 * Sandbox-facing (connect-once): an agent runtime serves a FRESH subscription
 * token from its workspace's central credential. Authenticated by the
 * per-sandbox HMAC token (NOT a user JWT), refreshed centrally here so no
 * runtime ever holds/rotates the refresh token. Sits before the principal gate.
 *
 * Returns true when the request was handled.
 */
export async function handleSandboxCredential(
  deps: {
    vault: CredentialVault;
    credentials: CredentialStore;
    gatewayFronted?: boolean;
  },
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (method !== "GET" || path !== "/sandbox/credential") return false;

  const sbToken = bearer(req, url);
  const claim = sbToken ? deps.vault.validateSandboxToken(sbToken) : null;
  if (!claim) {
    json(res, 401, { error: "unauthorized" });
    return true;
  }
  const provider = url.searchParams.get("provider") || "openai-codex";
  // Anthropic serves ONLY on a managed pod (gateway-fronted), where the gateway
  // is the single refresher and already answers access-only. A desktop/self-host
  // store may hold an anthropic entry too — the durability marker written when a
  // credential was pushed to a pod — but serving it locally would hand the SDK a
  // stale access token that OUTRANKS the working keychain credential
  // (CLAUDE_CODE_OAUTH_TOKEN wins inside the SDK), and refreshing it here would
  // make this host a second rotator of a refresh token family the pod already
  // owns. The marked 404 is the store's authoritative "not served here" answer;
  // the runtime's provenance manifest keeps it from deleting anything local.
  if (provider === "anthropic" && !deps.gatewayFronted) {
    json(
      res,
      404,
      { error: "anthropic is not served on this deployment" },
      { "x-houston-not-connected": "1" },
    );
    return true;
  }
  let cred = await deps.credentials.get(claim.workspaceId, provider);
  if (!cred) {
    // The marker makes this 404 the store's own authoritative "not connected"
    // answer. The runtime only drops served credentials on marked 404s — a bare
    // 404 (old host, wrong control-plane URL) must never read as a logout.
    json(
      res,
      404,
      { error: "workspace not connected" },
      { "x-houston-not-connected": "1" },
    );
    return true;
  }
  if (isExpiring(cred) && cred.refreshToken) {
    try {
      cred = await refreshCredential(cred);
      await deps.credentials.put(cred);
    } catch (err) {
      // No refresh path for this provider or the refresh was rejected. Serve
      // the existing token best-effort instead of 500-ing every turn: it may
      // still be valid, and a genuinely expired one surfaces as a clear auth
      // error on the real API call. This also stops the runtime's
      // multi-provider serve loop from spamming serve 500s for a stale, unused
      // credential (e.g. a leftover Claude login while the agent runs
      // OpenCode).
      console.error(
        `[sandbox/credential] refresh failed for ${cred.provider}, serving existing token:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  // Never serve a STALE anthropic token. Unlike every other provider, a served
  // anthropic token doesn't just fail its own API call — inside the Claude
  // Agent SDK the env token OUTRANKS the materialized `.credentials.json` /
  // keychain credential, so serving an expired access token would shadow a
  // still-working self-refreshing credential. Degrading to the marked 404
  // makes the runtime drop the served entry (provenance-gated) and fall back
  // to that file path instead.
  if (cred.provider === "anthropic" && isExpiring(cred)) {
    json(
      res,
      404,
      { error: "anthropic credential is stale" },
      { "x-houston-not-connected": "1" },
    );
    return true;
  }
  // Access token ONLY (Gate #2): the refresh token never leaves this process.
  // A stolen sandbox credential is then worth minutes, not an account. The
  // ChatGPT backend needs accountId, so that still ships. `kind` tells the
  // runtime to write an api_key entry (no refresh/expiry) vs an oauth one.
  json(res, 200, {
    provider: cred.provider,
    access: cred.accessToken,
    expires: cred.expiresAt,
    accountId: cred.accountId ?? null,
    kind: isApiKeyCredential(cred) ? "api_key" : "oauth",
    // Copilot Enterprise domain (not a secret) so the runtime sets the right API
    // base URL; null for individual Copilot and every other provider.
    enterpriseUrl: cred.enterpriseUrl ?? null,
  });
  return true;
}
