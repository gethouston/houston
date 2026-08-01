// Desktop ID-token refresh — the REST analogue of firebase-js-sdk auto-refresh.
//
// `refreshNow()` (single-flight) redeems the stored refresh token for a fresh
// idToken, merges it into the persisted Session (PRESERVING uid/email/
// displayName/photoUrl/provider), and re-saves. A terminal refresh failure
// (invalid_refresh_token / token_expired) is a real sign-out: it clears the
// session and returns null. Transient failures (network) rethrow so the caller
// retries rather than signing the user out. This backs
// `window.__HOUSTON_SESSION_REFRESH__`.
//
// The background timer that drives it (~5 min before `expiresAt`, with a
// backoff on transient failures) lives in `refresh-timer.ts`.
//
// Cache seam: this module never imports react-query. It calls an injected
// `setSessionSink` callback after each save/clear so Wave B (auth.ts) can push
// the new Session (or null) into the `["session"]` TanStack cache. Default is a
// no-op that logs — so an unwired build refreshes storage without crashing.

import { identityConfig } from "./config.ts";
import { isIdentityError } from "./errors.ts";
import { refreshIdToken } from "./firebase-rest.ts";
import { identityLog } from "./log.ts";
import type { Session } from "./session.ts";
import {
  clearSession,
  loadSession,
  peekSession,
  saveSession,
  sessionEpoch,
} from "./session-store.ts";

type SessionSink = (session: Session | null) => void;

let sessionSink: SessionSink = (session) => {
  identityLog(
    "debug",
    `session sink not wired; dropped ${session ? "refresh" : "sign-out"} update`,
    "identity/refresh",
  );
};

/** Wire refresh results into the app cache (Wave B: auth.ts sets this). */
export function setSessionSink(cb: SessionSink): void {
  sessionSink = cb;
}

let inFlight: Promise<string | null> | null = null;

/** Refresh the idToken now, collapsing concurrent callers to one REST call. */
export function refreshNow(): Promise<string | null> {
  if (inFlight) return inFlight;
  inFlight = doRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doRefresh(): Promise<string | null> {
  // Capture the epoch BEFORE the storage READ, not after it. `loadSession()` is
  // itself async (a keychain round-trip), so a sign-out landing while we are
  // awaiting the read would bump the epoch before we ever sampled it — and the
  // refresh would then happily re-save the session that sign-out just deleted,
  // snapping the UI back into the account the user just left (HOU sign-out race).
  const epochAtStart = sessionEpoch();
  const session = await loadSession();
  if (!session) return null;
  try {
    const refreshed = await refreshIdToken({
      apiKey: identityConfig.apiKey,
      refreshToken: session.refreshToken,
    });
    // Re-check immediately before the write: nothing may resurrect a session
    // cleared at ANY point since `epochAtStart` (during the read or the call).
    if (sessionEpoch() !== epochAtStart) {
      identityLog(
        "info",
        "refresh abandoned: session cleared mid-flight",
        "identity/refresh",
      );
      return null;
    }
    const next: Session = {
      ...session,
      idToken: refreshed.idToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
    };
    await saveSession(next);
    if (sessionEpoch() !== epochAtStart) {
      // A sign-out landed while the WRITE was in flight, so this refresh no
      // longer speaks for the signed-in identity. Compensate as the keychain ACL
      // rebind does (session-load.ts) — but ONLY for our own stale write. In
      // that same window a DIFFERENT account can already have signed in, and an
      // unconditional clear would delete the NEW user's session: they would be
      // bounced back to the sign-in screen with no way in until a relaunch.
      // `peekSession` reads without broadcasting; a read fault resolves null,
      // which correctly reads as "not provably ours, leave it alone".
      const persisted = await peekSession();
      if (persisted?.idToken === next.idToken) {
        identityLog(
          "info",
          "refresh abandoned: session cleared during the save; re-clearing our stale write",
          "identity/refresh",
        );
        await clearSession();
      } else {
        identityLog(
          "info",
          "refresh abandoned: a newer session already owns the store; leaving it untouched",
          "identity/refresh",
        );
      }
      return null;
    }
    sessionSink(next);
    return next.idToken;
  } catch (e) {
    // Terminal refresh outcomes = a real sign-out: the refresh token is no
    // longer usable (revoked/expired) OR the account itself is gone. The
    // securetoken endpoint returns USER_DISABLED for a disabled account and
    // USER_NOT_FOUND (mapped to `invalid_credentials`) for a deleted one —
    // both must sign the user out, not leave the session retrying on the
    // backoff: a deleted-account session otherwise boots past the login gate
    // and 401s every call with no way out. On the refresh endpoint
    // `invalid_credentials` can only mean the account is gone (the
    // password-shaped sources of that code never reach this call).
    if (
      isIdentityError(e) &&
      (e.code === "invalid_refresh_token" ||
        e.code === "token_expired" ||
        e.code === "user_disabled" ||
        e.code === "invalid_credentials")
    ) {
      await clearSession();
      sessionSink(null);
      return null;
    }
    throw e;
  }
}
