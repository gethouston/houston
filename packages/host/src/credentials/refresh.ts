import { githubCopilotProvider } from "@earendil-works/pi-ai/providers/github-copilot";
import { isApiKeyCredential, type WorkspaceCredential } from "../ports";
import {
  exchangeRefreshToken,
  TransientRefreshError,
} from "./oauth-token-exchange";

/**
 * pi-ai's Copilot OAuth flow, reached through the provider's `auth.oauth`
 * surface (pi ≥0.80.8 removed the standalone `refreshGitHubCopilotToken`
 * export; the provider's lazy OAuth wrapper loads the same implementation on
 * first use). Constructed once — the provider object is stateless.
 */
const copilotOAuth = githubCopilotProvider().auth.oauth;

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

export interface RefreshOptions {
  /** Total attempts, including the first. Default 2. */
  attempts?: number;
  /** Injectable delay (tests pass a spy; production waits for real). */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Jittered ~250-500ms — spreads a fleet's retries off a recovering resolver. */
const backoffMs = (): number => 250 + Math.floor(Math.random() * 250);

/**
 * True if the access token is within `skewMs` of expiry (or already expired). An
 * API-key credential never expires, so it is never "expiring".
 */
export function isExpiring(
  cred: WorkspaceCredential,
  skewMs = 120_000,
): boolean {
  if (isApiKeyCredential(cred)) return false;
  return Date.now() >= cred.expiresAt - skewMs;
}

/**
 * Exchange the refresh token for a new access (+ rotated refresh) token. Throws
 * on any failure — a stale token is never returned silently. An API-key
 * credential has nothing to refresh and is returned unchanged.
 *
 * ONLY failures that provably predate the connection (DNS, refused socket) are
 * retried, up to `opts.attempts` (default 2) with a jittered backoff. Anything
 * that could have reached the server — a timeout, an abort, a 5xx, a 429, any
 * 4xx — is NEVER retried: the endpoint may already have consumed the rotating
 * refresh token, and a second attempt would spend a grant we no longer hold.
 */
export async function refreshCredential(
  cred: WorkspaceCredential,
  opts: RefreshOptions = {},
): Promise<WorkspaceCredential> {
  if (isApiKeyCredential(cred)) return cred;

  // GitHub Copilot does NOT use a standard refresh-token grant. Its short-lived
  // (~25 min) Copilot token is minted from the long-lived GitHub OAuth token via
  // GitHub's own Copilot token endpoint (a GET to copilot_internal/v2/token,
  // Bearer + Copilot editor headers) — `cred.refreshToken` holds that GitHub
  // token. Without this, the central serve can't refresh Copilot: every turn
  // past the ~25 min mark serves a stale token (401, no response), and a
  // reopened app can't re-mint, so the workspace reads as disconnected. Reuse
  // pi-ai's exact exchange so the headers/skew never drift from the runtime's.
  if (cred.provider === "github-copilot") {
    if (!copilotOAuth)
      throw new Error("pi-ai github-copilot provider exposes no OAuth flow");
    // `enterpriseUrl` (set only for GitHub Copilot Enterprise) routes the refresh
    // at the company's GitHub: pi-ai hits `api.<domain>/copilot_internal/v2/token`
    // instead of github.com. Absent => individual Copilot. Preserve it on the
    // refreshed credential so the next refresh keeps targeting the same GHE.
    const r = await copilotOAuth.refresh({
      type: "oauth",
      access: cred.accessToken,
      refresh: cred.refreshToken,
      expires: cred.expiresAt,
      ...(cred.enterpriseUrl ? { enterpriseUrl: cred.enterpriseUrl } : {}),
    });
    return {
      workspaceId: cred.workspaceId,
      provider: cred.provider,
      accessToken: r.access,
      refreshToken: r.refresh, // the GitHub token is long-lived (returned as-is)
      accountId: cred.accountId,
      expiresAt: r.expires,
      enterpriseUrl: cred.enterpriseUrl,
    };
  }

  const cfg = OAUTH[cred.provider];
  if (!cfg)
    throw new Error(`no OAuth refresh config for provider ${cred.provider}`);

  const attempts = Math.max(1, opts.attempts ?? 2);
  const sleep = opts.sleep ?? realSleep;
  let transient: TransientRefreshError | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(backoffMs());
    try {
      return await exchangeRefreshToken(cfg, cred);
    } catch (err) {
      // Terminal rejections and unretryable 4xx propagate immediately.
      if (!(err instanceof TransientRefreshError)) throw err;
      transient = err;
    }
  }
  // Exhausted: never a RefreshRejectedError, so the serve route keeps the
  // credential and falls back to the stored token instead of signing the user
  // out over an outage.
  throw transient ?? new Error(`OAuth refresh failed for ${cred.provider}`);
}
