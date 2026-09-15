import { disconnectRejectedCredential } from "../credentials/disconnect";
import { RefreshRejectedError } from "../credentials/oauth-token-exchange";
import { isExpiring } from "../credentials/refresh";
import {
  CredentialGoneError,
  sharedCredentialRefresher,
} from "../credentials/refresh-coalescer";
import type { WorkspaceId } from "../domain/types";
import type {
  CredentialActing,
  CredentialStore,
  WorkspaceCredential,
} from "../ports";

/**
 * Serve-time refresh margin. The real invariant is pi's OAuth validity floor:
 * pi refreshes ANY stored OAuth entry within 5 minutes of expiry
 * (`DEFAULT_OAUTH_MINIMUM_VALIDITY_MS`, pi-ai dist/auth/resolve.js), and a
 * served entry is access-only (Gate #2's `refresh:""`) — pi has nothing to
 * refresh it with, and before the runtime's empty-refresh guard it POSTed
 * `refresh_token=""` at the provider (PRODUCT-1317, seen live as
 * PRODUCT-1293). A token served with less than the floor remaining is born
 * inside pi's refresh window, so the refresh here must fire while MORE than
 * the floor remains: 6 minutes is pi's 5 plus a minute of slack. Passed
 * explicitly — `isExpiring`'s 2-minute default serves its other callers.
 */
const SERVE_VALIDITY_SKEW_MS = 6 * 60 * 1000;

/**
 * What the serve should hand out: a credential good for this turn, or the
 * store's authoritative "not connected" and the message to carry it.
 */
export type ServeCandidate =
  | { cred: WorkspaceCredential }
  | { notConnected: string };

/**
 * Bring a credential up to the serve margin, centrally. Only this process
 * refreshes, so no runtime ever holds or rotates a refresh token.
 */
export async function refreshedForServe(
  credentials: CredentialStore,
  workspaceId: WorkspaceId,
  cred: WorkspaceCredential,
  acting: CredentialActing | undefined,
): Promise<ServeCandidate> {
  if (!isExpiring(cred, SERVE_VALIDITY_SKEW_MS) || !cred.refreshToken)
    return { cred };
  const refreshing = cred.provider;
  try {
    // Single-flight: one runtime process per agent serves this per turn AND
    // per /providers poll, so the same expiring credential arrives here N
    // times at once. Refreshing it N times rotates the refresh token N times;
    // every loser gets invalid_grant and the catch below disconnects the
    // user. The coalescer makes the burst one exchange.
    return {
      cred: await sharedCredentialRefresher.run({
        workspaceId,
        provider: refreshing,
        acting,
        load: () => credentials.get(workspaceId, refreshing, acting),
        persist: (c) => credentials.put(c, acting),
        // The flight's own re-check must judge expiry by THIS route's margin,
        // or it hands back the very token the route already deemed too short.
        skewMs: SERVE_VALIDITY_SKEW_MS,
      }),
    };
  } catch (err) {
    if (err instanceof CredentialGoneError) {
      // The user disconnected the provider while this refresh was queued.
      // Nothing was refreshed and nothing was written; the store's answer is
      // simply "not connected", and there is no dead token to compare-and-
      // delete.
      return { notConnected: "workspace not connected" };
    }
    if (err instanceof RefreshRejectedError) {
      // The refresh TOKEN itself was rejected — dead until the user
      // reconnects. The policy (compare-and-delete, never a blind remove)
      // lives in credentials/disconnect.ts; it answers with the credential
      // that superseded ours, or null when the dead one is confirmed gone.
      const superseding = await disconnectRejectedCredential({
        credentials,
        workspaceId,
        rejected: cred,
        acting,
        reason: err.message,
      });
      // Confirmed dead: the marked 404 makes the runtime drop its served
      // entry (provenance-gated) and the provider reads signed-out with the
      // reconnect flow — the credential IS the switch. Otherwise serve what
      // the store holds NOW, through every check the route still makes
      // (anthropic staleness included).
      if (!superseding)
        return {
          notConnected: `${cred.provider} session ended; reconnect the provider`,
        };
      return { cred: superseding };
    }
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
    return { cred };
  }
}
