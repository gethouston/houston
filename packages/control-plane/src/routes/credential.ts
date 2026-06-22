import type { IncomingMessage, ServerResponse } from "node:http";
import { isApiKeyCredential, type CredentialStore, type CredentialVault } from "../ports";
import { isExpiring, refreshCredential } from "../credentials/refresh";
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
  deps: { vault: CredentialVault; credentials: CredentialStore },
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
  let cred = await deps.credentials.get(claim.workspaceId, provider);
  if (!cred) {
    json(res, 404, { error: "workspace not connected" });
    return true;
  }
  if (isExpiring(cred)) {
    try {
      cred = await refreshCredential(cred);
      await deps.credentials.put(cred);
    } catch (err) {
      // No refresh path for this provider (e.g. anthropic has no refresh config
      // yet) or the refresh was rejected. Serve the existing token best-effort
      // instead of 500-ing every turn: it may still be valid, and a genuinely
      // expired one surfaces as a clear auth error on the real API call. This
      // also stops the runtime's multi-provider serve loop from spamming serve
      // 500s for a stale, unused credential (e.g. a leftover Claude login while
      // the agent runs OpenCode).
      console.error(
        `[sandbox/credential] refresh failed for ${cred.provider}, serving existing token:`,
        err instanceof Error ? err.message : err,
      );
    }
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
  });
  return true;
}
