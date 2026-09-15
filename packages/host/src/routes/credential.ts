import type { IncomingMessage, ServerResponse } from "node:http";
import { isExpiring } from "../credentials/refresh";
import { RemoteCredentialDeadError } from "../credentials/remote-store";
import {
  type CredentialStore,
  type CredentialVault,
  isApiKeyCredential,
} from "../ports";
import type { CredentialServeHealer } from "./credential-healer";
import { refreshedForServe } from "./credential-refresh";
import { bearer, json } from "./http";
import { defineRoute } from "./registry";

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
defineRoute({
  group: "sandbox-credential",
  method: "GET",
  path: "/sandbox/credential",
  phase: "sandbox",
  classification: "internal-sandbox",
  reason:
    "An agent runtime serves itself a subscription token with a per-sandbox HMAC token; no client ever holds this surface.",
  source: "packages/host/src/routes/credential.ts",
  handler: ({ deps, method, path, url, req, res }) =>
    handleSandboxCredential(deps, method, path, url, req, res),
});

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
  // owns. The marked 404 carries a SECOND marker, `x-houston-not-served-here`:
  // this is a deployment fact ("anthropic never serves here"), not a verdict
  // about the central store, and the runtime's ghost cleanup (PRODUCT-1323)
  // keys on that distinction — without it, every desktop/self-host serve sync
  // would read this answer as a workspace disconnect and delete the browser
  // login's legitimate `.credentials.json`.
  if (provider === "anthropic" && !deps.gatewayFronted) {
    json(
      res,
      404,
      { error: "anthropic is not served on this deployment" },
      { "x-houston-not-connected": "1", "x-houston-not-served-here": "1" },
    );
    return true;
  }
  // WHOSE credential this serve is for (HOU-976). The gateway mints the header;
  // absent (desktop, self-host, every pre-HOU-976 pod) means the single shared
  // scope, so the whole path below is byte-identical to before.
  const actingHeader = req.headers["x-houston-acting-as"];
  const actingAs = Array.isArray(actingHeader) ? actingHeader[0] : actingHeader;
  const acting = actingAs ? { actingAs } : undefined;
  // `fresh=1` = the runtime is retrying after this provider FAILED a turn's
  // auth (its auth-failure mark is active). A reconnect capture lands in the
  // central store without passing through this process, so the remote store's
  // 15s cached "not connected" — populated by the failing turn moments earlier
  // — would fail the very retry the reconnect just unblocked, re-rendering the
  // reconnect card in a loop (PRODUCT-1515). Bounded: the runtime sends it
  // only while a failure mark is active, at most once per serve sync.
  if (url.searchParams.get("fresh") === "1")
    deps.credentials.invalidate?.(provider, acting);
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
  const refreshed = await refreshedForServe(
    deps.credentials,
    claim.workspaceId,
    cred,
    acting,
  );
  if ("notConnected" in refreshed)
    return notConnected(res, refreshed.notConnected);
  cred = refreshed.cred;
  // Never serve a STALE anthropic token. Unlike every other provider, a served
  // anthropic token doesn't just fail its own API call — inside the Claude
  // Agent SDK the env token OUTRANKS the materialized `.credentials.json` /
  // keychain credential, so serving an expired access token would shadow a
  // still-working self-refreshing credential. Degrading to the marked 404
  // makes the runtime drop the served entry (provenance-gated) and fall back
  // to that file path instead.
  //
  // Deliberately judged by `isExpiring`'s DEFAULT margin, not this route's
  // 6-minute refresh trigger: the marked 404 is an AUTHORITATIVE disconnect
  // (the runtime deletes its served entry and, since PRODUCT-1323, the ghost
  // file). Until every gateway serves with the raised 10-minute ServeSkew, a
  // healthy token can arrive here with 5-6 minutes left — refusing it would
  // flap anthropic org-wide once per token lifetime. A short-but-live token
  // is safe to hand out: the runtime's empty-refresh guard (PRODUCT-1317)
  // keeps pi from POSTing an empty refresh for it, and the current turn just
  // uses the remaining validity.
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
