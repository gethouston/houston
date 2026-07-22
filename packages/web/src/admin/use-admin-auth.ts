// React glue for the operator dashboard auth (see `auth.ts` for the pure logic).
//
// Owns the live `AdminSession`, a proactive REST refresh loop (mirroring the
// desktop `identity/refresh.ts`), and localStorage persistence so a reload keeps
// the operator signed in. Exposes the live Firebase ID token the dashboard sends
// as the control-plane bearer.

import {
  identityConfig,
  refreshIdToken,
  signInWithPassword,
} from "@houston/app/lib/identity";
import {
  initWebAuth,
  webSignInWithGoogle,
  webSignOut,
} from "@houston/web-identity";
import { useCallback, useEffect, useState } from "react";
import {
  ADMIN_SESSION_KEY,
  type AdminSession,
  adminAuthMessage,
  isTerminalRefreshError,
  parseStoredSession,
  REFRESH_RETRY_MS,
  refreshDelayMs,
  sessionFromIdentity,
  sessionFromPassword,
} from "./auth";

function persist(session: AdminSession | null): void {
  try {
    if (session) {
      window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(ADMIN_SESSION_KEY);
    }
  } catch (e) {
    // localStorage blocked (private mode): the in-memory session still works
    // this tab; only reload-persistence is lost. Non-fatal, but never silent.
    console.warn("[admin] could not persist session:", e);
  }
}

export interface AdminAuth {
  /** Live Firebase ID token for the control-plane bearer, or null when out. */
  token: string | null;
  email: string | null;
  ready: boolean;
  busy: boolean;
  error: string | null;
  signInPassword: (email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAdminAuth(): AdminAuth {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adopt = useCallback((next: AdminSession | null) => {
    persist(next);
    setSession(next);
  }, []);

  // Rehydrate a persisted session on mount, refreshing once so we never run on
  // a stale ID token. Also init the web SDK for the (optional) Google popup.
  useEffect(() => {
    let cancelled = false;
    if (identityConfig.apiKey) initWebAuth(identityConfig);
    const stored = parseStoredSession(
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(ADMIN_SESSION_KEY),
    );
    if (!stored) {
      setReady(true);
      return;
    }
    refreshIdToken({
      apiKey: identityConfig.apiKey,
      refreshToken: stored.refreshToken,
    })
      .then((r) => {
        if (!cancelled) {
          adopt({
            ...stored,
            idToken: r.idToken,
            refreshToken: r.refreshToken,
            expiresAt: r.expiresAt,
          });
        }
      })
      .catch(() => {
        // Stored refresh token no longer valid (or unreachable) → signed out.
        if (!cancelled) adopt(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [adopt]);

  // Proactive refresh: one timer per session; success re-runs this effect,
  // a terminal failure signs out, a transient failure retries shortly.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let retryId: ReturnType<typeof setTimeout> | undefined;
    const run = async (): Promise<void> => {
      try {
        const r = await refreshIdToken({
          apiKey: identityConfig.apiKey,
          refreshToken: session.refreshToken,
        });
        if (!cancelled) {
          adopt({
            ...session,
            idToken: r.idToken,
            refreshToken: r.refreshToken,
            expiresAt: r.expiresAt,
          });
        }
      } catch (e) {
        if (cancelled) return;
        if (isTerminalRefreshError(e)) {
          adopt(null); // real sign-out
        } else {
          console.warn("[admin] token refresh failed, retrying shortly:", e);
          retryId = setTimeout(() => void run(), REFRESH_RETRY_MS);
        }
      }
    };
    const id = setTimeout(() => void run(), refreshDelayMs(session.expiresAt));
    return () => {
      cancelled = true;
      clearTimeout(id);
      if (retryId) clearTimeout(retryId);
    };
  }, [session, adopt]);

  const signInPassword = useCallback(
    async (email: string, password: string) => {
      setBusy(true);
      setError(null);
      try {
        const r = await signInWithPassword({
          apiKey: identityConfig.apiKey,
          email,
          password,
        });
        adopt(sessionFromPassword(r));
      } catch (e) {
        setError(adminAuthMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [adopt],
  );

  const signInGoogle = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const s = await webSignInWithGoogle();
      if (s) adopt(sessionFromIdentity(s.session)); // null = popup cancelled (benign)
    } catch (e) {
      setError(adminAuthMessage(e));
    } finally {
      setBusy(false);
    }
  }, [adopt]);

  const signOut = useCallback(async () => {
    adopt(null); // operator sees signed-out immediately
    try {
      await webSignOut(); // clear any SDK (Google) persistence too
    } catch (e) {
      console.warn("[admin] SDK sign-out failed:", e);
    }
  }, [adopt]);

  return {
    token: session?.idToken ?? null,
    email: session?.email ?? null,
    ready,
    busy,
    error,
    signInPassword,
    signInGoogle,
    signOut,
  };
}
