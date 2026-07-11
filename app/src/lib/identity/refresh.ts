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
// `startProactiveRefresh()` schedules a timer ~5 min before `expiresAt` and
// reschedules after each fire; it never throws into the timer.
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
  const session = await loadSession();
  if (!session) return null;
  // Capture the epoch BEFORE the network call; if a sign-out clears the session
  // while we're awaiting, we must not resurrect it (HOU sign-out race).
  const epochAtStart = sessionEpoch();
  try {
    const refreshed = await refreshIdToken({
      apiKey: identityConfig.apiKey,
      refreshToken: session.refreshToken,
    });
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
    sessionSink(next);
    return next.idToken;
  } catch (e) {
    // Terminal refresh outcomes = a real sign-out: the refresh token is no
    // longer usable (revoked/expired) OR the account itself is gone. The
    // securetoken endpoint returns USER_DISABLED for a disabled account — that
    // must sign the user out, not leave the session retrying on the backoff.
    if (
      isIdentityError(e) &&
      (e.code === "invalid_refresh_token" ||
        e.code === "token_expired" ||
        e.code === "user_disabled")
    ) {
      await clearSession();
      sessionSink(null);
      return null;
    }
    throw e;
  }
}

// ── Proactive refresh timer ───────────────────────────────────────────────

/** Refresh this long before `expiresAt` so a call never rides an expired token. */
const REFRESH_SKEW_MS = 5 * 60_000;

// Backoff for a TRANSIENT proactive-refresh failure (network down). Without it,
// a token at/near expiry reschedules at the expiry-based delay `expiresAt - now
// - skew`, which is 0 once inside the skew window — so a failing refresh would
// hot-loop the securetoken endpoint while offline. On a transient failure we
// retry on this exponential backoff instead; a terminal failure clears the
// session (scheduleNext then stops), and a success resets the backoff.
const INITIAL_REFRESH_BACKOFF_MS = 30_000;
const MAX_REFRESH_BACKOFF_MS = 15 * 60_000;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let proactiveRunning = false;
let getSessionForTimer: () => Promise<Session | null> = loadSession;
let backoffMs = 0;

/** Begin proactively refreshing. Call after sign-in and on boot with a session. */
export function startProactiveRefresh(
  getSession: () => Promise<Session | null> = loadSession,
): void {
  getSessionForTimer = getSession;
  proactiveRunning = true;
  backoffMs = 0;
  void scheduleNext();
}

/** Stop the proactive timer (sign-out / teardown). */
export function stopProactiveRefresh(): void {
  proactiveRunning = false;
  backoffMs = 0;
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

/** Arm the single proactive timer after `delayMs` (no-op once torn down). */
function armTimer(delayMs: number): void {
  if (!proactiveRunning) return;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void onTimer(), delayMs);
}

async function scheduleNext(): Promise<void> {
  if (!proactiveRunning) return;
  let session: Session | null = null;
  try {
    session = await getSessionForTimer();
  } catch (e) {
    identityLog(
      "warn",
      `proactive refresh: reading session failed: ${String(e)}`,
      "identity/refresh",
    );
  }
  if (!proactiveRunning || !session) return;
  const delay = Math.max(0, session.expiresAt - Date.now() - REFRESH_SKEW_MS);
  armTimer(delay);
}

async function onTimer(): Promise<void> {
  try {
    await refreshNow();
    // Success (or a terminal sign-out that returned null): resume normal
    // expiry-based scheduling. If the session was cleared, scheduleNext stops.
    backoffMs = 0;
    void scheduleNext();
  } catch (e) {
    // Transient failure (network): retry on an exponential backoff rather than
    // hot-looping the 0-delay expiry-based schedule inside the skew window.
    backoffMs =
      backoffMs === 0
        ? INITIAL_REFRESH_BACKOFF_MS
        : Math.min(backoffMs * 2, MAX_REFRESH_BACKOFF_MS);
    identityLog(
      "warn",
      `proactive refresh failed; retrying in ${backoffMs}ms: ${String(e)}`,
      "identity/refresh",
    );
    armTimer(backoffMs);
  }
}
