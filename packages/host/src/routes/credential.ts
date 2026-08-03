import type { IncomingMessage, ServerResponse } from "node:http";
import { disconnectRejectedCredential } from "../credentials/disconnect";
import { RefreshRejectedError } from "../credentials/oauth-token-exchange";
import { isExpiring } from "../credentials/refresh";
import {
  CredentialGoneError,
  sharedCredentialRefresher,
} from "../credentials/refresh-coalescer";
import { RemoteCredentialDeadError } from "../credentials/remote-store";
import {
  type CredentialStore,
  type CredentialVault,
  isApiKeyCredential,
} from "../ports";
import type { CredentialServeHealer } from "./credential-healer";
import { bearer, json } from "./http";

/**
 * The store's authoritative "not connected" answer, and the ONLY way this route
 * writes a 404. The marker is load-bearing: the runtime drops a served
 * credential only on a MARKED 404 — a bare one (old host, wrong control-plane
 * URL) must never read as a logout — so it can never be forgotten at one of the
 * several places that degrade to "not connected".
 */
function notConnected(res: ServerResponse, error: string): true {
  json(res, 404, { error }, { "x-houston-not-connected": "1" });
  return true;
}

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
    credentialHealer?: CredentialServeHealer;
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
  if (provider === "anthropic" && !deps.gatewayFronted)
    return notConnected(res, "anthropic is not served on this deployment");
  // WHOSE credential this serve is for (HOU-976). The gateway mints the header;
  // absent (desktop, self-host, every pre-HOU-976 pod) means the single shared
  // scope, so the whole path below is byte-identical to before.
  const actingHeader = req.headers["x-houston-acting-as"];
  const actingAs = Array.isArray(actingHeader) ? actingHeader[0] : actingHeader;
  const acting = actingAs ? { actingAs } : undefined;
  let deadError: RemoteCredentialDeadError | undefined;
  let cred = null;
  try {
    cred = await deps.credentials.get(claim.workspaceId, provider, acting);
  } catch (error) {
    if (!(error instanceof RemoteCredentialDeadError)) throw error;
    deadError = error;
  }
  if (!cred && deps.credentialHealer) {
    // Self-heal reads the runtime's LIVE credential and pushes it centrally —
    // as this member, or a warm pod would capture whoever's file it found into
    // the wrong row (and one member's cooldown would mute everyone else's).
    const healed = await deps.credentialHealer.attempt({
      workspaceId: claim.workspaceId,
      agentId: claim.agentId,
      provider,
      actingAs,
    });
    if (healed)
      cred = await deps.credentials.get(claim.workspaceId, provider, acting);
  }
  if (!cred) {
    if (deadError) throw deadError;
    return notConnected(res, "workspace not connected");
  }
  if (isExpiring(cred) && cred.refreshToken) {
    const refreshing = cred.provider;
    try {
      // Single-flight: one runtime process per agent serves this per turn AND
      // per /providers poll, so the same expiring credential arrives here N
      // times at once. Refreshing it N times rotates the refresh token N times;
      // every loser gets invalid_grant and the catch below disconnects the
      // user. The coalescer makes the burst one exchange.
      cred = await sharedCredentialRefresher.run({
        workspaceId: claim.workspaceId,
        provider: refreshing,
        acting,
        load: () => deps.credentials.get(claim.workspaceId, refreshing, acting),
        persist: (c) => deps.credentials.put(c, acting),
      });
    } catch (err) {
      if (err instanceof CredentialGoneError) {
        // The user disconnected the provider while this refresh was queued.
        // Nothing was refreshed and nothing was written; the store's answer is
        // simply "not connected", and there is no dead token to compare-and-
        // delete.
        return notConnected(res, "workspace not connected");
      }
      if (err instanceof RefreshRejectedError) {
        // The refresh TOKEN itself was rejected — dead until the user
        // reconnects. The policy (compare-and-delete, never a blind remove)
        // lives in credentials/disconnect.ts; it answers with the credential
        // that superseded ours, or null when the dead one is confirmed gone.
        const superseding = await disconnectRejectedCredential({
          credentials: deps.credentials,
          workspaceId: claim.workspaceId,
          rejected: cred,
          acting,
          reason: err.message,
        });
        // Confirmed dead: the marked 404 makes the runtime drop its served
        // entry (provenance-gated) and the provider reads signed-out with the
        // reconnect flow — the credential IS the switch. Otherwise serve what
        // the store holds NOW, through every check below (anthropic staleness
        // included).
        if (!superseding)
          return notConnected(
            res,
            `${cred.provider} session ended; reconnect the provider`,
          );
        cred = superseding;
      } else {
        // No refresh path for this provider, or a transient failure (network,
        // 5xx). Serve the existing token best-effort instead of 500-ing every
        // turn: it may still be valid, and a genuinely expired one surfaces as
        // a clear auth error on the real API call. This also stops the
        // runtime's multi-provider serve loop from spamming serve 500s for a
        // stale, unused credential (e.g. a leftover Claude login while the
        // agent runs OpenCode).
        console.error(
          `[sandbox/credential] refresh failed for ${cred.provider}, serving existing token:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
  // Never serve a STALE anthropic token. Unlike every other provider, a served
  // anthropic token doesn't just fail its own API call — inside the Claude
  // Agent SDK the env token OUTRANKS the materialized `.credentials.json` /
  // keychain credential, so serving an expired access token would shadow a
  // still-working self-refreshing credential. Degrading to the marked 404
  // makes the runtime drop the served entry (provenance-gated) and fall back
  // to that file path instead.
  if (cred.provider === "anthropic" && isExpiring(cred))
    return notConnected(res, "anthropic credential is stale");
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
    scope: cred.scope ?? "team",
  });
  return true;
}
