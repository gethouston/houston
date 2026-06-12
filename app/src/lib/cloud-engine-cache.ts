/**
 * localStorage cache for the cloud-mode engine config. Survives full page
 * reloads; cleared on SIGNED_OUT or when the cached user no longer matches
 * the live Supabase session.
 *
 * Sandbox-only utility for VITE_HOUSTON_CLOUD_MODE.
 */

const CACHE_KEY = "houston-cloud-engine-v1";

export interface CachedConfig {
  userId: string;
  baseUrl: string;
  token: string;
}

export function readCache(): CachedConfig | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.userId === "string" &&
      typeof parsed?.baseUrl === "string" &&
      typeof parsed?.token === "string"
    ) {
      return parsed;
    }
  } catch {
    /* malformed cache — treat as miss */
  }
  return null;
}

export function writeCache(c: CachedConfig): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* localStorage blocked — degrade silently */
  }
}

export function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* best-effort */
  }
}
