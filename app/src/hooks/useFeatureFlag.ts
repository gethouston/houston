/**
 * `useFeatureFlag` — five-layer resolution of an advanced-settings flag.
 *
 * Resolution chain (top wins):
 *   1. URL query: `?flag.<key>=on|off|true|false`   — DEV only
 *   2. `window.__HOUSTON_FLAGS_OVERRIDE__[key]`     — DEV only
 *   3. `localStorage["flag.<key>"]`                  — DEV only
 *   4. Engine preference (`/v1/preferences/:key`)   — production source of truth
 *   5. `getFlagDefault(key)` from the registry       — code default
 *
 * Layers 1-3 are wrapped in `import.meta.env.DEV` so they're stripped from
 * production bundles by Vite's dead-code elimination. Production users only
 * see layers 4 and 5.
 *
 * Caching: TanStack Query, 60s stale time, `refetchOnWindowFocus: false`.
 * Cross-tab / cross-client invalidation arrives via the `PreferenceChanged`
 * WS event handled in `use-agent-invalidation.ts`.
 */
import { useQuery } from "@tanstack/react-query";
import { tauriPreferences } from "../lib/tauri";
import { getFlagDefault, stringToFlag } from "../lib/featureFlags";

declare global {
  interface Window {
    /** DEV-only flag override map. Set in DevTools console for ad-hoc testing. */
    __HOUSTON_FLAGS_OVERRIDE__?: Record<string, string | boolean | undefined>;
  }
}

/** Normalize a developer-supplied override token to a boolean, or `null` if unrecognized. */
function parseOverride(raw: string | boolean | null | undefined): boolean | null {
  if (raw === true || raw === false) return raw;
  if (raw === null || raw === undefined) return null;
  const v = raw.toLowerCase();
  if (v === "true" || v === "on" || v === "1") return true;
  if (v === "false" || v === "off" || v === "0") return false;
  return null;
}

/** Layer 1: URL query parameter. Returns `null` outside dev or when absent. */
function readUrlOverride(key: string): boolean | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return parseOverride(params.get(`flag.${key}`));
  } catch {
    return null;
  }
}

/** Layer 2: `window.__HOUSTON_FLAGS_OVERRIDE__`. Returns `null` outside dev or when absent. */
function readWindowOverride(key: string): boolean | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === "undefined") return null;
  return parseOverride(window.__HOUSTON_FLAGS_OVERRIDE__?.[key]);
}

/** Layer 3: localStorage. Returns `null` outside dev, when absent, or when storage throws. */
function readLocalStorageOverride(key: string): boolean | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === "undefined") return null;
  try {
    return parseOverride(window.localStorage.getItem(`flag.${key}`));
  } catch {
    return null;
  }
}

/**
 * Resolve a feature flag to a boolean. Suspends the component on first
 * fetch (returns the default until the query settles), then reflects the
 * persisted value. Re-renders on local toggle (cache invalidation) and on
 * `PreferenceChanged` WS events (cross-tab invalidation).
 */
export function useFeatureFlag(key: string): boolean {
  const urlOverride = readUrlOverride(key);
  const windowOverride = readWindowOverride(key);
  const localStorageOverride = readLocalStorageOverride(key);

  const query = useQuery({
    queryKey: ["preference", key] as const,
    queryFn: () => tauriPreferences.get(key),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    // Engine read failures degrade silently (rule 8: reads degrade, writes
    // alert). The `tauriPreferences.get` call already logs internally.
  });

  // Walk the chain. First non-null layer wins.
  if (urlOverride !== null) return urlOverride;
  if (windowOverride !== null) return windowOverride;
  if (localStorageOverride !== null) return localStorageOverride;
  const stored = stringToFlag(query.data);
  if (stored !== null) return stored;
  return getFlagDefault(key);
}
