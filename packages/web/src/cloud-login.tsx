import { supabase } from "@houston/app/lib/supabase";
import { useEffect } from "react";
import AppTree from "./app-tree";

/**
 * Cloud bootstrap.
 *
 * The web build configures the app's OWN Supabase client (VITE_CP_SUPABASE_* →
 * SUPABASE_URL/ANON at build time), so the desktop app's native auth drives
 * everything: its `SignInScreen` renders when signed out, and its sidebar
 * `UserMenu` shows the signed-in user — no bespoke cloud login UI, no floating
 * profile chip. All this component does is point the engine adapter at the
 * control plane and keep the bearer token in sync with the live Supabase
 * session.
 *
 * The token is read live by the engine adapter (control-plane.liveToken), so a
 * silent token refresh is picked up without a reload.
 */
/**
 * Dev-only bearer: with `VITE_CP_DEV_TOKEN` set (and no Supabase configured, so
 * the app's SignInScreen is skipped), the adapter authenticates to a CP_DEV host
 * as that principal — e.g. `dev:alice` for the DevTokenVerifier. Unset in any
 * real build, so production always uses the live Supabase session.
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
      apply(DEV_TOKEN); // dev: skip Supabase entirely
      return;
    }
    void supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session?.access_token ?? ""));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      apply(session?.access_token ?? ""),
    );
    // The 401 → refresh → replay seam (HOU-687): the adapter's gatewayAuthFetch
    // calls this to force-mint a fresh access token when the gateway rejects
    // the current one (expired while the tab idled, gateway roll severed the
    // streams). Null = the session is really gone; the 401 surfaces.
    const refresher = async () => {
      const { data, error } = await supabase.auth.refreshSession();
      const token = error ? null : (data.session?.access_token ?? null);
      if (token) apply(token);
      return token;
    };
    window.__HOUSTON_SESSION_REFRESH__ = refresher;
    return () => {
      sub.subscription.unsubscribe();
      if (window.__HOUSTON_SESSION_REFRESH__ === refresher) {
        delete window.__HOUSTON_SESSION_REFRESH__;
      }
    };
  }, [controlPlaneUrl]);

  return <AppTree />;
}
