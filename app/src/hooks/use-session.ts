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

/**
 * Thrown by the desktop session query when the device's secure storage can't be
 * READ (locked keychain, denied prompt, or a stale post-update ACL) — distinct
 * from a signed-out `null`. It puts the query into its error state so the gate
 * renders a retryable storage-error screen, NEVER the sign-in screen (which
 * would look like a spurious logout). The query retries it a few times first.
 */
export class SessionUnavailableError extends Error {
  constructor(detail: string) {
    super(`session storage unavailable: ${detail}`);
    this.name = "SessionUnavailableError";
  }
}

// Belt-and-suspenders bound on the first web `onIdTokenChanged` emission.
// firebase-js-sdk reliably emits (with a user or null) once persistence settles,
// but a wedged init must never pin the splash on `isLoading` forever.
const WEB_SESSION_TIMEOUT_MS = 10_000;

// Bound on the timeout path's `webCurrentSession()` probe: it may hit the
// network (`getIdToken`), and the escape hatch itself must never re-pin the
// splash the 10s timeout exists to unpin.
const WEB_PROBE_TIMEOUT_MS = 3_000;

// Start the proactive-refresh timer exactly once on boot when a persisted
// desktop session loads. The queryFn is the single place it runs: React Query
// shares one query across every `useSession` consumer, so the queryFn fires
// once — unlike the per-consumer mount effect below. `startProactiveRefresh` is
// itself idempotent, and this guard keeps it belt-and-suspenders single.
let proactiveStarted = false;

async function loadDesktopSession(): Promise<Session | null> {
  const state = await loadSessionState();
  if (state.kind === "unavailable") {
    // Secure storage couldn't be read — surface it as a typed error (retried
    // by the query) so the gate shows a storage-error screen, not sign-in.
    throw new SessionUnavailableError(state.error);
  }
  const session = state.kind === "session" ? state.session : null;
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
      // Don't blindly fall to signed-out: a returning user's persisted session
      // may still be settling. Ask the SDK directly — resolve the real session
      // when one exists, and only resolve null when the SDK confirms no user.
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
    // Guard a synchronous emission: if the callback settled before assignment,
    // tear the subscription down immediately so it never leaks.
    const returned = web.webOnIdTokenChanged((session) => finish(session));
    if (settled) returned();
    else unsub = returned;
  });
}

/**
 * Current identity `Session | null` on both surfaces (the `["session"]` query
 * key). Desktop reads the Keychain via `loadSessionState` and mirrors
 * `session-store` changes; web reads the firebase-js-sdk session and mirrors
 * `onIdTokenChanged`. Returns `null` (never a spinner) when identity isn't
 * configured. On a desktop secure-storage READ fault the query enters its error
 * state with a {@link SessionUnavailableError} (retried a few times first) — the
 * gate renders a storage-error screen for that, never the sign-in screen.
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
    // Only a transient secure-storage read fault is worth retrying (a locked
    // keychain often unlocks moments later); everything else resolves, so this
    // never loops. 4 attempts total (initial + 3 retries, 1s/2s/4s backoff).
    retry: (count, err) => err instanceof SessionUnavailableError && count < 3,
    retryDelay: (attempt) => 1000 * 2 ** attempt,
  });
}
