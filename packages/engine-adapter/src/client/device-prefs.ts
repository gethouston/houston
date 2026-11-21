import type { KeyValueStore } from "@houston/sdk";

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

export function createDevicePrefsStore(): KeyValueStore {
  return {
    get: async (key) => readLocalPref(key),
    set: async (key, value) => writeLocalPref(key, value),
    delete: async (key) => clearLocalPref(key),
  };
}
