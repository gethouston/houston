import { applyExternalSession } from "@houston/app/lib/auth";
import { identityConfig, type Session } from "@houston/app/lib/identity";
import {
  initWebAuth,
  webOnIdTokenChanged,
  webRefreshIdToken,
} from "@houston/web-identity";
import { useEffect } from "react";
import AppTree from "./app-tree";

const DEV_TOKEN =
  (import.meta as { env?: Record<string, string | undefined> }).env
    ?.VITE_CP_DEV_TOKEN || "";

export function CloudApp({ controlPlaneUrl }: { controlPlaneUrl: string }) {
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
      apply(DEV_TOKEN);
      return;
    }
    initWebAuth(identityConfig);
    const unsub = webOnIdTokenChanged((session: Session | null) => {
      apply(session?.idToken ?? "");
      applyExternalSession(session);
    });
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
