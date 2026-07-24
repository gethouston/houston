// Desktop/web persistence for the identity `Session` — one JSON blob.
//
// The KV adapter (keychain vs browser) and the read-fault-vs-absence contract
// live in session-storage-kv.ts; the pure load orchestration (state mapping,
// notify decision, once-per-run ACL rebind) lives in session-load.ts. This
// module owns the app-facing API: the load/save/clear surface, the auth epoch,
// and the `subscribeSession` pub/sub.
//
// Error policy (no-silent-failures): `loadSessionState` keeps a storage READ
// FAULT distinct from absence so the UI never treats an unreadable store as
// signed-out (the "logged out after update" bug); `save`/`clear` RETHROW on
// failure so a dropped write becomes a visible toast upstream.
//
// Reactive seam: this module is storage-only and never imports react-query. It
// exposes (1) `subscribeSession` — a tiny pub/sub broadcasting the current
// session after every non-fault load/save/clear, which `useSession` mirrors
// into the TanStack cache, and (2) `SESSION_QUERY_KEY`, the shared `["session"]`
// cache key those callers write.

import { queryKeys } from "../query-keys.ts";
import { identityLog } from "./log.ts";
import { type Session, serializeSession } from "./session.ts";
import { createSessionLoader, type SessionLoadState } from "./session-load.ts";
import { isKeychainMode, storage, storageKey } from "./session-storage-kv.ts";

export type { SessionLoadState } from "./session-load.ts";

/** The TanStack Query key holding `Session | null` on both surfaces. Defined
 *  canonically in `lib/query-keys.ts` (the pure key module) so the space-cache
 *  purge can reference it without importing this identity chain. */
export const SESSION_QUERY_KEY = queryKeys.session();

// Monotonic auth epoch, bumped every time the session is cleared (sign-out /
// terminal refresh). An in-flight refresh captures it before its network call
// and abandons the save if it changed underneath — so a sign-out can never be
// re-overwritten by a refresh that started before it (refresh.ts).
let epoch = 0;

/** The current auth epoch. Increments on every `clearSession()`. */
export function sessionEpoch(): number {
  return epoch;
}

type Subscriber = (session: Session | null) => void;
const subscribers = new Set<Subscriber>();

/** Observe session changes (post load/save/clear). Returns an unsubscribe fn. */
export function subscribeSession(cb: Subscriber): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

function notify(session: Session | null): void {
  for (const cb of subscribers) {
    // A subscriber must not break the storage op; log and continue (this is the
    // documented event-callback exception to no-silent-failures).
    try {
      cb(session);
    } catch (e) {
      identityLog(
        "error",
        `session subscriber threw: ${String(e)}`,
        "identity/session-store",
      );
    }
  }
}

const loadSessionStateImpl = createSessionLoader({
  read: () => storage.getItem(storageKey),
  notify,
  keychainMode: isKeychainMode,
  rewrite: (blob) => storage.setItem(storageKey, blob),
  epoch: sessionEpoch,
  remove: () => storage.removeItem(storageKey),
});

/**
 * Read the persisted session, keeping a storage read fault (`unavailable`)
 * distinct from a real signed-out (`none`). UI gating uses this so a locked /
 * denied / stale-ACL store never renders the sign-in screen.
 */
export function loadSessionState(): Promise<SessionLoadState> {
  return loadSessionStateImpl();
}

/**
 * Collapsed load: `Session | null` (a read fault maps to `null`). The refresh
 * paths use this — they only care "is there a usable session to refresh right
 * now"; a transient fault correctly resolves to "none to refresh". UI gating
 * must use `loadSessionState` instead so a fault is not mistaken for signed-out.
 */
export async function loadSession(): Promise<Session | null> {
  const state = await loadSessionState();
  return state.kind === "session" ? state.session : null;
}

/** Persist the session. Rethrows if the write fails (no silent drop). */
export async function saveSession(session: Session): Promise<void> {
  await storage.setItem(storageKey, serializeSession(session));
  notify(session);
}

/** Remove the persisted session. Rethrows if the delete fails. */
export async function clearSession(): Promise<void> {
  // Bump the epoch FIRST so a refresh already awaiting its network call sees the
  // change the moment sign-out begins, even if the keychain delete is slow.
  epoch += 1;
  await storage.removeItem(storageKey);
  notify(null);
}
