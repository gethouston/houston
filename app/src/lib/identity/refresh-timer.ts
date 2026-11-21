import { identityLog } from "./log.ts";
import { refreshNow } from "./refresh.ts";
import type { Session } from "./session.ts";
import { loadSession } from "./session-store.ts";

const REFRESH_SKEW_MS = 5 * 60_000;

const INITIAL_REFRESH_BACKOFF_MS = 30_000;
const MAX_REFRESH_BACKOFF_MS = 15 * 60_000;

const MIN_RESCHEDULE_MS = 30_000;

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let proactiveRunning = false;
let getSessionForTimer: () => Promise<Session | null> = loadSession;
let backoffMs = 0;

export function startProactiveRefresh(
  getSession: () => Promise<Session | null> = loadSession,
): void {
  getSessionForTimer = getSession;
  proactiveRunning = true;
  backoffMs = 0;
  void scheduleNext();
}

export function stopProactiveRefresh(): void {
  proactiveRunning = false;
  backoffMs = 0;
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function armTimer(delayMs: number): void {
  if (!proactiveRunning) return;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void onTimer(), delayMs);
}

async function scheduleNext(minDelayMs = 0): Promise<void> {
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
  const delay = Math.max(
    minDelayMs,
    session.expiresAt - Date.now() - REFRESH_SKEW_MS,
  );
  armTimer(delay);
}

async function onTimer(): Promise<void> {
  try {
    await refreshNow();
    backoffMs = 0;
    void scheduleNext(MIN_RESCHEDULE_MS);
  } catch (e) {
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
