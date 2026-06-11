import { useEffect } from "react";
import { supabase } from "@houston/app/lib/supabase";
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
export function CloudApp({ controlPlaneUrl }: { controlPlaneUrl: string }) {
  // Set the engine globals synchronously on first render, before AppTree's
  // EngineGate checks readiness or any data hook calls getEngine().
  if (typeof window !== "undefined" && !window.__HOUSTON_ENGINE__) {
    window.__HOUSTON_CP__ = true;
    window.__HOUSTON_ENGINE__ = { baseUrl: controlPlaneUrl, token: "" };
  }

  useEffect(() => {
    window.__HOUSTON_CP__ = true;
    const apply = (token: string) => {
      window.__HOUSTON_ENGINE__ = { baseUrl: controlPlaneUrl, token };
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session?.access_token ?? ""));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      apply(session?.access_token ?? ""),
    );
    return () => sub.subscription.unsubscribe();
  }, [controlPlaneUrl]);

  return <AppTree />;
}
