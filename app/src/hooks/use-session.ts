import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  identityConfig,
  isIdentityConfigured,
  loadSession,
  SESSION_QUERY_KEY,
  type Session,
  startProactiveRefresh,
  subscribeSession,
} from "../lib/identity";
import { identityLog } from "../lib/identity/log";
import { osIsTauri } from "../lib/os-bridge";

// Belt-and-suspenders bound on the first web `onIdTokenChanged` emission.
// firebase-js-sdk reliably emits (with a user or null) once persistence settles,
// but a wedged init must never pin the splash on `isLoading` forever.
const WEB_SESSION_TIMEOUT_MS = 10_000;

// Start the proactive-refresh timer exactly once on boot when a persisted
// desktop session loads. The queryFn is the single place it runs: React Query
// shares one query across every `useSession` consumer, so the queryFn fires
// once — unlike the per-consumer mount effect below. `startProactiveRefresh` is
// itself idempotent, and this guard keeps it belt-and-suspenders single.
let proactiveStarted = false;

async function loadDesktopSession(): Promise<Session | null> {
  const session = await loadSession();
  if (session && !proactiveStarted) {
    proactiveStarted = true;
    startProactiveRefresh();
  }
  return session;
}

// Web: the firebase-js-sdk restores a persisted session asynchronously. Await
// the FIRST `onIdTokenChanged` emission so `isLoading` stays true until Firebase
// has resolved persistence — no flash-of-signed-out for a returning web user.
// The durable subscription (mount effect below) keeps the cache updated after.
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
      identityLog(
        "warn",
        "web session load timed out waiting for onIdTokenChanged; resolving null",
        "identity/use-session",
      );
      finish(null);
    }, WEB_SESSION_TIMEOUT_MS);
    // Guard a synchronous emission: if the callback settled before assignment,
    // tear the subscription down immediately so it never leaks.
    const returned = web.webOnIdTokenChanged((session) => finish(session));
    if (settled) returned();
    else unsub = returned;
  });
}

/**
 * Current identity `Session | null` on both surfaces (the `["session"]` query
 * key). Desktop reads the Keychain via `loadSession` and mirrors `session-store`
 * changes; web reads the firebase-js-sdk session and mirrors `onIdTokenChanged`.
 * Returns `null` (never a spinner) when identity isn't configured.
 */
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
    retry: false,
  });
}
