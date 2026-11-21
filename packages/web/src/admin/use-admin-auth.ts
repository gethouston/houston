import {
  IdentityError,
  identityConfig,
  refreshIdToken,
  signInWithPassword,
} from "@houston/app/lib/identity";
import {
  initWebAuth,
  webDiscardPending,
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
  persistSession,
  REFRESH_RETRY_MS,
  refreshDelayMs,
  sessionFromIdentity,
  sessionFromPassword,
} from "./auth";

export interface AdminAuth {
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
    persistSession(next);
    setSession(next);
  }, []);

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
        if (!cancelled) adopt(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [adopt]);

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
          adopt(null);
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
      if (s && "kind" in s) {
        webDiscardPending(s.handle);
        throw new IdentityError("identity_already_linked");
      }
      if (s) adopt(sessionFromIdentity(s.session));
    } catch (e) {
      setError(adminAuthMessage(e));
    } finally {
      setBusy(false);
    }
  }, [adopt]);

  const signOut = useCallback(async () => {
    adopt(null);
    try {
      await webSignOut();
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
