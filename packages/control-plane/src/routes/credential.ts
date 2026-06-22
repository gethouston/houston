import type { IncomingMessage, ServerResponse } from "node:http";
import { isExpiring, refreshCredential } from "../credentials/refresh";
import type { CredentialStore, CredentialVault } from "../ports";
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
    cred = await refreshCredential(cred);
    await deps.credentials.put(cred);
  }
  // Access token ONLY (Gate #2): the refresh token never leaves this process.
  // A stolen sandbox credential is then worth minutes, not an account. The
  // ChatGPT backend needs accountId, so that still ships.
  json(res, 200, {
    provider: cred.provider,
    access: cred.accessToken,
    expires: cred.expiresAt,
    accountId: cred.accountId ?? null,
  });
  return true;
}
