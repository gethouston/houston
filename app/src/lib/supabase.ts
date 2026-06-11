import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { resolveAuthStorageConfig } from "./auth-storage";
import { logger } from "./logger";

// __SUPABASE_URL__ / __SUPABASE_ANON_KEY__ baked at build time by Vite.
// Empty values → Supabase client still constructs but all auth calls are
// no-ops (isAuthConfigured() returns false so the UI won't attempt sign-in).
const URL_ = typeof __SUPABASE_URL__ !== "undefined" ? __SUPABASE_URL__ : "";
const KEY = typeof __SUPABASE_ANON_KEY__ !== "undefined" ? __SUPABASE_ANON_KEY__ : "";

/**
 * Release storage adapter that round-trips to Rust via the `auth_*` Tauri
 * commands. Sessions live in macOS Keychain or a DPAPI-encrypted file on
 * Windows (see `app/src-tauri/src/auth.rs`), never localStorage. The PKCE
 * code verifier is stored here too during OAuth, so release auth is
 * encrypted-at-rest end to end.
 *
 * Errors are NOT silently swallowed (they were until v0.4.15, which is
 * how Windows users ended up with sessions that worked in-memory but
 * never persisted to disk — every `setItem` was failing in Credential
 * Manager and we never told anyone). `setItem` and `removeItem` rethrow
 * so supabase-js's `_saveSession` surfaces the error up through
 * `setSession` / `exchangeCodeForSession`, where `app/src/lib/auth.ts`
 * turns it into a user-visible toast via `emitAuthError`. `getItem`
 * still returns null on error because "no entry yet" is the common
 * case and not worth a toast.
 */
const keychainStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return await invoke<string | null>("auth_get_item", { key });
    } catch (e) {
      logger.warn(`[auth] keychain getItem(${key}) failed: ${e}`);
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await invoke("auth_set_item", { key, value });
    } catch (e) {
      logger.error(`[auth] keychain setItem(${key}) failed: ${e}`);
      throw new Error(`Sign-in storage failed: ${e}`);
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await invoke("auth_remove_item", { key });
    } catch (e) {
      logger.warn(`[auth] keychain removeItem(${key}) failed: ${e}`);
      // Sign-out is best-effort: if we can't clear the keychain entry
      // the in-memory sign-out still runs, and a future setItem will
      // overwrite the stale entry.
    }
  },
};

const browserStorage = {
  getItem(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Dev fallback. Session won't persist if browser storage is blocked.
    }
  },
  removeItem(key: string): void {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // best-effort
    }
  },
};

const authStorageConfig = resolveAuthStorageConfig({
  storageMode:
    typeof __HOUSTON_AUTH_STORAGE_MODE__ !== "undefined"
      ? __HOUSTON_AUTH_STORAGE_MODE__
      : "browser",
  storageScope:
    typeof __HOUSTON_AUTH_STORAGE_SCOPE__ !== "undefined"
      ? __HOUSTON_AUTH_STORAGE_SCOPE__
      : "",
});

export const supabase: SupabaseClient = createClient(
  URL_ || "https://placeholder.supabase.co",
  KEY || "placeholder-anon-key",
  {
    auth: {
      storage:
        authStorageConfig.mode === "keychain" ? keychainStorage : browserStorage,
      storageKey: authStorageConfig.storageKey,
      autoRefreshToken: true,
      persistSession: true,
      // Desktop catches the OAuth code via the `houston://` deep link and calls
      // `exchangeCodeForSession` itself, so its URL sniffer stays off. The web
      // build has no deep link — it lands on `/auth/callback?code=…` and relies
      // on Supabase to consume it, so enable the sniffer in browsers only.
      detectSessionInUrl: !isTauri(),
      flowType: "pkce",
    },
  },
);

export const isAuthConfigured = (): boolean => Boolean(URL_ && KEY);
