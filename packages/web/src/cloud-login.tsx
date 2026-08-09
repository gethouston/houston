import { applyExternalSession } from "@houston/app/lib/auth";
import { identityConfig, type Session } from "@houston/app/lib/identity";
import {
  initWebAuth,
  webOnIdTokenChanged,
  webRefreshIdToken,
} from "@houston/web-identity";
import { useEffect } from "react";
import AppTree from "./app-tree";

/**
 * Cloud bootstrap.
 *
 * The web build configures the app's OWN Firebase Auth (VITE_CP_FIREBASE_* /
 * FIREBASE_* baked at build time), so the desktop app's native auth drives
 * everything: its `SignInScreen` renders when signed out, and the Settings
 * index's identity header shows the signed-in user — no bespoke cloud login UI,
 * no floating profile chip. All this component does is point the engine adapter at the
 * control plane and keep the bearer (Firebase ID) token in sync with the live
 * SDK session (`onIdTokenChanged`), which also covers silent token refresh.
 */
/**
 * Dev-only bearer: with `VITE_CP_DEV_TOKEN` set (and no Firebase configured, so
 * the app's SignInScreen is skipped), the adapter authenticates to a CP_DEV host
 * as that principal — e.g. `dev:alice` for the DevTokenVerifier. Unset in any
 * real build, so production always uses the live Firebase session.
 */
const DEV_TOKEN =
  (import.meta as { env?: Record<string, string | undefined> }).env
    ?.VITE_CP_DEV_TOKEN || "";

export function CloudApp({ controlPlaneUrl }: { controlPlaneUrl: string }) {
  // Set the engine globals synchronously on first render, before AppTree's
  // EngineGate checks readiness or any data hook calls getEngine().
  if (typeof window !== "undefined" && !window.__HOUSTON_ENGINE__) {
    window.__HOUSTON_CP__ = true;
    window.__HOUSTON_ENGINE__ = { baseUrl: controlPlaneUrl, token: DEV_TOKEN };
  }

  useEffect(() => {
    window.__HOUSTON_CP__ = true;
    const apply = (token: string) => {
      window.__HOUSTON_ENGINE__ = { baseUrl: controlPlaneUrl, token };
    };
    if (DEV_TOKEN) {
      apply(DEV_TOKEN); // dev: skip Firebase entirely
      return;
    }
    initWebAuth(identityConfig);
    // Mirror the live SDK session into the engine bearer AND the ["session"]
    // TanStack cache (the shared auth gate source). onIdTokenChanged fires on
    // sign-in, sign-out, and every silent refresh, so the bearer stays fresh.
    // The session cache write goes through applyExternalSession — NOT a direct
    // setQueryData — so a uid change (account switch) trips the HOU-903
    // identity-change reset and the previous account's caches/stores are
    // dropped before the new account's world loads. The bearer is applied
    // FIRST so post-reset refetches already carry the new identity.
    const unsub = webOnIdTokenChanged((session: Session | null) => {
      apply(session?.idToken ?? "");
      applyExternalSession(session);
    });
    // The 401 → refresh → replay seam (HOU-687): the adapter's gatewayAuthFetch
    // calls this to force-mint a fresh ID token when the gateway rejects the
    // current one. The forced refresh also fires onIdTokenChanged above, so the
    // engine global updates too. Null = the session is really gone; the 401 surfaces.
    window.__HOUSTON_SESSION_REFRESH__ = webRefreshIdToken;
    return () => {
      unsub();
      if (window.__HOUSTON_SESSION_REFRESH__ === webRefreshIdToken) {
        delete window.__HOUSTON_SESSION_REFRESH__;
      }
    };
  }, [controlPlaneUrl]);

  return <AppTree />;
}
