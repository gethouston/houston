import { isApiKeyCredential, type CredentialStore, type WorkspaceCredential } from "../ports";

/**
 * Central OAuth refresh — the control plane is the SINGLE refresher of each
 * workspace's subscription token, so refresh-token rotation never conflicts
 * across the user's agents. Endpoints + client ids mirror pi's own OAuth
 * (packages/runtime/node_modules/@earendil-works/pi-ai/.../openai-codex.js).
 */
const OAUTH: Record<string, { tokenUrl: string; clientId: string }> = {
  "openai-codex": {
    tokenUrl: "https://auth.openai.com/oauth/token",
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  },
  // anthropic uses a different (PKCE) refresh; added when Claude connect lands.
};

/**
 * True if the access token is within `skewMs` of expiry (or already expired). An
 * API-key credential never expires, so it is never "expiring".
 */
export function isExpiring(cred: WorkspaceCredential, skewMs = 120_000): boolean {
  if (isApiKeyCredential(cred)) return false;
  return Date.now() >= cred.expiresAt - skewMs;
}

/**
 * Exchange the refresh token for a new access (+ rotated refresh) token. Throws
 * on any failure — a stale token is never returned silently. An API-key
 * credential has nothing to refresh and is returned unchanged.
 */
export async function refreshCredential(cred: WorkspaceCredential): Promise<WorkspaceCredential> {
  if (isApiKeyCredential(cred)) return cred;
  const cfg = OAUTH[cred.provider];
  if (!cfg) throw new Error(`no OAuth refresh config for provider ${cred.provider}`);

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cfg.clientId,
      refresh_token: cred.refreshToken,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OAuth refresh failed (${res.status}) for ${cred.provider}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json.access_token || !json.refresh_token || typeof json.expires_in !== "number") {
    throw new Error(`OAuth refresh response missing fields for ${cred.provider}`);
  }
  return {
    workspaceId: cred.workspaceId,
    provider: cred.provider,
    accessToken: json.access_token,
    refreshToken: json.refresh_token, // rotation-safe: persist whatever comes back
    accountId: cred.accountId, // the refresh endpoint doesn't return it; it's stable
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

/**
 * Return a currently-valid access token for a stored credential, refreshing it
 * (and persisting the rotated token back to the store) when it's near expiry.
 * This is what the per-turn "serve" endpoint calls.
 */
export async function validAccessToken(
  store: CredentialStore,
  cred: WorkspaceCredential,
): Promise<string> {
  if (!isExpiring(cred)) return cred.accessToken;
  const fresh = await refreshCredential(cred);
  await store.put(fresh);
  return fresh.accessToken;
}
