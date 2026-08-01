// The proactive ID-token refresh timer — the REST analogue of firebase-js-sdk's
// background refresh. Split from `refresh.ts` (which owns the single-flight
// `refreshNow` itself) so both stay inside the 200-line limit: this module is
// pure scheduling policy, and it never throws into the timer.

import { identityLog } from "./log.ts";
import { refreshNow } from "./refresh.ts";
import type { Session } from "./session.ts";
import { loadSession } from "./session-store.ts";

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
