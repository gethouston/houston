// Desktop/web persistence for the identity `Session` — one JSON blob.
//
// The blob key is the `storageKey` from `resolveAuthStorageConfig` (the SAME
// derivation supabase.ts used, so an upgrading user's stale blob sits under the
// reused `houston-auth` key and `deserializeSession` discards it). Keychain
// mode round-trips through the os-bridge `osAuth*` wrappers (never `invoke`
// directly); browser mode uses `localStorage`.
//
// Error policy (mirrors supabase.ts, tightened for no-silent-failures): `get`
// returns null on not-found or a read fault (a "no entry yet" is the common
// case, logged not thrown); `set`/`remove` RETHROW on failure so a Keychain
// write that silently dropped the session becomes a visible toast upstream.
//
// Reactive seam: this module is storage-only and never imports react-query. It
// exposes (1) `subscribeSession` — a tiny pub/sub that broadcasts the current
// session after every load/save/clear, which Wave B's `useSession` subscribes
// to and mirrors into the TanStack cache, and (2) `SESSION_QUERY_KEY`, the
// shared `["session"]` cache key those callers write. Keeping cache writes out
// of here preserves testability and the storage/UI boundary.

import { resolveAuthStorageConfig } from "../auth-storage.ts";
import {
  osAuthGetItem,
  osAuthRemoveItem,
  osAuthSetItem,
} from "../os-bridge.ts";
import { identityLog } from "./log.ts";
import {
  deserializeSession,
  type Session,
  serializeSession,
} from "./session.ts";

/** The TanStack Query key holding `Session | null` on both surfaces. */
export const SESSION_QUERY_KEY = ["session"] as const;

const config = resolveAuthStorageConfig({
  storageMode:
    typeof __HOUSTON_AUTH_STORAGE_MODE__ !== "undefined"
      ? __HOUSTON_AUTH_STORAGE_MODE__
      : "browser",
  storageScope:
    typeof __HOUSTON_AUTH_STORAGE_SCOPE__ !== "undefined"
      ? __HOUSTON_AUTH_STORAGE_SCOPE__
      : "",
});

interface KVStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const keychainStorage: KVStorage = {
  async getItem(key) {
    try {
      return await osAuthGetItem(key);
    } catch (e) {
      identityLog(
        "warn",
        `keychain getItem(${key}) failed: ${String(e)}`,
        "identity/session-store",
      );
      return null;
    }
  },
  async setItem(key, value) {
    try {
      await osAuthSetItem(key, value);
    } catch (e) {
      identityLog(
        "error",
        `keychain setItem(${key}) failed: ${String(e)}`,
        "identity/session-store",
      );
      throw new Error(`Sign-in storage failed: ${String(e)}`);
    }
  },
  async removeItem(key) {
    try {
      await osAuthRemoveItem(key);
    } catch (e) {
      identityLog(
        "error",
        `keychain removeItem(${key}) failed: ${String(e)}`,
        "identity/session-store",
      );
      throw new Error(`Sign-out storage failed: ${String(e)}`);
    }
  },
};

const browserStorage: KVStorage = {
  async getItem(key) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch (e) {
      identityLog(
        "warn",
        `localStorage getItem(${key}) failed: ${String(e)}`,
        "identity/session-store",
      );
      return null;
    }
  },
  async setItem(key, value) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch (e) {
      identityLog(
        "error",
        `localStorage setItem(${key}) failed: ${String(e)}`,
        "identity/session-store",
      );
      throw new Error(`Sign-in storage failed: ${String(e)}`);
    }
  },
  async removeItem(key) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch (e) {
      identityLog(
        "error",
        `localStorage removeItem(${key}) failed: ${String(e)}`,
        "identity/session-store",
      );
      throw new Error(`Sign-out storage failed: ${String(e)}`);
    }
  },
};

const storage: KVStorage =
  config.mode === "keychain" ? keychainStorage : browserStorage;

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

/** Read + parse the persisted session (null when absent/stale/corrupt). */
export async function loadSession(): Promise<Session | null> {
  const raw = await storage.getItem(config.storageKey);
  const session = deserializeSession(raw);
  notify(session);
  return session;
}

/** Persist the session. Rethrows if the write fails (no silent drop). */
export async function saveSession(session: Session): Promise<void> {
  await storage.setItem(config.storageKey, serializeSession(session));
  notify(session);
}

/** Remove the persisted session. Rethrows if the delete fails. */
export async function clearSession(): Promise<void> {
  // Bump the epoch FIRST so a refresh already awaiting its network call sees the
  // change the moment sign-out begins, even if the keychain delete is slow.
  epoch += 1;
  await storage.removeItem(config.storageKey);
  notify(null);
}
