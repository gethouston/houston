import { isIdentityError } from "./errors.ts";
import { identityLog } from "./log.ts";
import { mintUsableIdToken } from "./refresh-mint.ts";
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

export function setSessionSink(cb: SessionSink): void {
  sessionSink = cb;
}

let inFlight: Promise<string | null> | null = null;

export function refreshNow(): Promise<string | null> {
  if (inFlight) return inFlight;
  inFlight = doRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doRefresh(): Promise<string | null> {
  const epochAtStart = sessionEpoch();
  const session = await loadSession();
  if (!session) return null;
  try {
    const refreshed = await mintUsableIdToken(session.refreshToken);
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
