import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  identityConfig,
  isIdentityConfigured,
  loadSessionState,
  SESSION_QUERY_KEY,
  type Session,
  startProactiveRefresh,
  subscribeSession,
} from "../lib/identity";
import { identityLog } from "../lib/identity/log";
import { osIsTauri } from "../lib/os-bridge";

export class SessionUnavailableError extends Error {
  constructor(detail: string) {
    super(`session storage unavailable: ${detail}`);
    this.name = "SessionUnavailableError";
  }
}

const WEB_SESSION_TIMEOUT_MS = 10_000;

const WEB_PROBE_TIMEOUT_MS = 3_000;

let proactiveStarted = false;

async function loadDesktopSession(): Promise<Session | null> {
  const state = await loadSessionState();
  if (state.kind === "unavailable") {
    throw new SessionUnavailableError(state.error);
  }
  const session = state.kind === "session" ? state.session : null;
  if (session && !proactiveStarted) {
    proactiveStarted = true;
    startProactiveRefresh();
  }
  return session;
}

async function loadWebSession(): Promise<Session | null> {
  const web = await import("@houston/web-identity");
  web.initWebAuth(identityConfig);
  return new Promise<Session | null>((resolve) => {
    let settled = false;
    let unsub = () => {};
    const finish = (session: Session | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      resolve(session);
    };
    const timer = setTimeout(() => {
      Promise.race([
        web.webCurrentSession(),
        new Promise<"probe-timeout">((r) => {
          setTimeout(() => r("probe-timeout"), WEB_PROBE_TIMEOUT_MS);
        }),
      ])
        .then((current) => {
          if (current === "probe-timeout") {
            identityLog(
              "error",
              "web session timeout probe itself timed out; resolving null",
              "identity/use-session",
            );
            finish(null);
            return;
          }
          identityLog(
            "warn",
            current
              ? "web session load timed out but the SDK has a persisted user; resolving it"
              : "web session load timed out; the SDK reports no user, resolving null",
            "identity/use-session",
          );
          finish(current);
        })
        .catch((e) => {
          identityLog(
            "error",
            `web session timeout probe failed, resolving null: ${String(e)}`,
            "identity/use-session",
          );
          finish(null);
        });
    }, WEB_SESSION_TIMEOUT_MS);
    const returned = web.webOnIdTokenChanged((session) => finish(session));
    if (settled) returned();
    else unsub = returned;
  });
}

export function useSession() {
  const qc = useQueryClient();

  useEffect(() => {
    if (!isIdentityConfigured()) return;
    if (osIsTauri()) {
      return subscribeSession((session) => {
        qc.setQueryData<Session | null>(SESSION_QUERY_KEY, session);
      });
    }
    let unsub = () => {};
    void import("@houston/web-identity").then((web) => {
      web.initWebAuth(identityConfig);
      unsub = web.webOnIdTokenChanged((session) => {
        qc.setQueryData<Session | null>(SESSION_QUERY_KEY, session);
      });
    });
    return () => unsub();
  }, [qc]);

  return useQuery<Session | null>({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => {
      if (!isIdentityConfigured()) return null;
      return osIsTauri() ? loadDesktopSession() : loadWebSession();
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: (count, err) => err instanceof SessionUnavailableError && count < 3,
    retryDelay: (attempt) => 1000 * 2 ** attempt,
  });
}
