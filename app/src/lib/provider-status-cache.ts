import type { ProviderStatus } from "./tauri";

const CACHE_KEY_PREFIX = "houston.providerStatusCache.v2";

const LEGACY_CACHE_KEY = "houston.providerStatusCache.v1";

export function activeProviderStatusScope(): string {
  if (typeof window === "undefined") return "personal";
  return window.__HOUSTON_ACTIVE_ORG__ ?? "personal";
}

export function providerProbeScopeChanged(startedIn: string): boolean {
  return activeProviderStatusScope() !== startedIn;
}

function scopedCacheKey(scope: string): string {
  return `${CACHE_KEY_PREFIX}.${scope}`;
}

export function purgeLegacyProviderStatusCache(
  storage: Pick<Storage, "removeItem"> | undefined = typeof localStorage !==
  "undefined"
    ? localStorage
    : undefined,
): void {
  try {
    storage?.removeItem(LEGACY_CACHE_KEY);
  } catch {}
}

purgeLegacyProviderStatusCache();

function isProviderStatus(value: unknown): value is ProviderStatus {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.provider === "string" &&
    typeof v.cli_installed === "boolean" &&
    typeof v.auth_state === "string" &&
    typeof v.authenticated === "boolean" &&
    typeof v.cli_name === "string"
  );
}

type StatusStore = Pick<Storage, "getItem" | "setItem">;

export function loadCachedProviderStatuses(
  storage: StatusStore = localStorage,
  scope: string = activeProviderStatusScope(),
): Record<string, ProviderStatus> {
  try {
    const raw = storage.getItem(scopedCacheKey(scope));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<string, ProviderStatus> = {};
    for (const [id, status] of Object.entries(parsed)) {
      if (isProviderStatus(status)) out[id] = status;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveCachedProviderStatuses(
  statuses: Record<string, ProviderStatus>,
  storage: StatusStore = localStorage,
  scope: string = activeProviderStatusScope(),
): void {
  try {
    storage.setItem(scopedCacheKey(scope), JSON.stringify(statuses));
  } catch {}
}
