// Low-level key/value persistence for the identity `Session` blob — the storage
// adapter half of session-store.ts, split out so each file stays inside the
// 200-line limit. Keychain mode round-trips the os-bridge `osAuth*` wrappers
// (never `invoke` directly); browser mode uses `localStorage`.
//
// Reads return a discriminated `ReadResult` so the session store can tell a
// genuine "no entry yet" (`value: null`) from a storage READ FAULT
// (`{ ok: false }`). That distinction is the whole point: a locked keychain, a
// denied prompt, or a stale post-update ACL must NOT masquerade as a
// signed-out user (which would drop the user on the sign-in screen). Writes
// still RETHROW on failure so a dropped save becomes a visible toast upstream.

import { resolveAuthStorageConfig } from "../auth-storage.ts";
import {
  osAuthGetItem,
  osAuthRemoveItem,
  osAuthSetItem,
} from "../os-bridge.ts";
import { identityLog } from "./log.ts";

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

/** The blob key both surfaces persist the session under. */
export const storageKey = config.storageKey;

/** True in desktop keychain mode — drives the once-per-run ACL rebind. */
export const isKeychainMode = config.mode === "keychain";

/**
 * A storage read: a present/absent value, or a read FAULT kept distinct from
 * absence. `value: null` means "no entry" (a real signed-out); `ok: false`
 * means the store could not be read at all (locked / denied / stale ACL).
 */
export type ReadResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

export interface KVStorage {
  getItem(key: string): Promise<ReadResult>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const keychainStorage: KVStorage = {
  async getItem(key) {
    try {
      return { ok: true, value: await osAuthGetItem(key) };
    } catch (e) {
      // A rejected read is a FAULT, not an absent entry — the os-bridge
      // resolves `null` for a real miss (auth.rs maps `NoEntry → Ok(None)`).
      // Keep it distinct; loadSessionState logs it once and reports
      // `unavailable` instead of a spurious signed-out.
      return { ok: false, error: String(e) };
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
      return { ok: true, value: globalThis.localStorage?.getItem(key) ?? null };
    } catch (e) {
      // localStorage read faults are near-impossible, but map them to a fault
      // too (symmetry with keychain) rather than a silent null.
      return { ok: false, error: String(e) };
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

/** The active adapter for this build (keychain on desktop, browser in dev/web). */
export const storage: KVStorage = isKeychainMode
  ? keychainStorage
  : browserStorage;
