/**
 * The device's own preference store: this browser's `localStorage`, one
 * namespaced key per preference.
 *
 * ONE layout, two readers — the adapter's `getPreference`/`setPreference`
 * (`./config-prefs-mixin`) and `@houston/sdk`, which reaches the same keys
 * through its `devicePreferences` port (`../sdk-client`). A capability that moved
 * into the SDK therefore reads back exactly what the user picked before it moved,
 * which is why the prefix and the bare key names are a contract, not a detail.
 *
 * Nothing here catches: a store that is blocked (hardened webview,
 * third-party-cookie blocking) or full (quota) THROWS out of every call.
 * Suppressing it let a write resolve having stored nothing — Settings kept the
 * palette the user had just picked on screen, the next boot lost it, and neither
 * the caller's optimistic revert nor any reporting path ever ran
 * (`packages/web/tests/device-prefs-storage.test.ts` pins that). A failed READ is
 * the same fact from the other side: "unknown", never "unset", and a caller that
 * holds a mirror of its own acts on the difference.
 */

import type { KeyValueStore } from "@houston/sdk";

/** Namespace for every device preference, so nothing collides with app state. */
const PREFIX = "houston.pref.";

export function readLocalPref(key: string): string | null {
  return localStorage.getItem(`${PREFIX}${key}`);
}

export function writeLocalPref(key: string, value: string): void {
  localStorage.setItem(`${PREFIX}${key}`, value);
}

export function clearLocalPref(key: string): void {
  localStorage.removeItem(`${PREFIX}${key}`);
}

/**
 * The same three calls as the SDK's {@link KeyValueStore} port. Async by the
 * port's shape (a keychain-backed host fits without adaptation); this
 * implementation answers synchronously and rejects on a store that refuses.
 */
export function createDevicePrefsStore(): KeyValueStore {
  return {
    get: async (key) => readLocalPref(key),
    set: async (key, value) => writeLocalPref(key, value),
    delete: async (key) => clearLocalPref(key),
  };
}
