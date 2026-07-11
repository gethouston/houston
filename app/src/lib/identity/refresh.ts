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
    if (
      isIdentityError(e) &&
      (e.code === "invalid_refresh_token" || e.code === "token_expired")
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

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let proactiveRunning = false;
let getSessionForTimer: () => Promise<Session | null> = loadSession;

/** Begin proactively refreshing. Call after sign-in and on boot with a session. */
export function startProactiveRefresh(
  getSession: () => Promise<Session | null> = loadSession,
): void {
  getSessionForTimer = getSession;
  proactiveRunning = true;
  void scheduleNext();
}

/** Stop the proactive timer (sign-out / teardown). */
export function stopProactiveRefresh(): void {
  proactiveRunning = false;
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
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
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void onTimer(), delay);
}

async function onTimer(): Promise<void> {
  try {
    await refreshNow();
  } catch (e) {
    identityLog(
      "warn",
      `proactive refresh failed: ${String(e)}`,
      "identity/refresh",
    );
  }
  void scheduleNext();
}
