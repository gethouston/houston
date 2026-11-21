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

export const storageKey = config.storageKey;

export const isKeychainMode = config.mode === "keychain";

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

export const storage: KVStorage = isKeychainMode
  ? keychainStorage
  : browserStorage;
