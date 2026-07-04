import type { ProviderStatus } from "./tauri";

/**
 * Boot-time cache of the last provider-status scan.
 *
 * Provider probes shell out to CLIs and can take seconds each (up to a 5s
 * timeout per provider), so the settings screen seeds its cards from this
 * snapshot and paints instantly; the live probe still runs and reconciles.
 * Same philosophy as the i18n locale flash-cache: localStorage is never the
 * source of truth, only a first-paint hint.
 */
const CACHE_KEY = "houston.providerStatusCache.v1";

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

/**
 * Last-known statuses, keyed by provider id. Invalid or unparseable entries
 * are dropped rather than trusted — a bad hint is worse than no hint.
 */
export function loadCachedProviderStatuses(
  storage: StatusStore = localStorage,
): Record<string, ProviderStatus> {
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<string, ProviderStatus> = {};
    for (const [id, status] of Object.entries(parsed)) {
      if (isProviderStatus(status)) out[id] = status;
    }
    return out;
  } catch {
    // Cache read is a paint hint, not a user action — a broken/blocked
    // localStorage just means we fall back to the probe-only path.
    return {};
  }
}

export function saveCachedProviderStatuses(
  statuses: Record<string, ProviderStatus>,
  storage: StatusStore = localStorage,
): void {
  try {
    storage.setItem(CACHE_KEY, JSON.stringify(statuses));
  } catch {
    // Same rationale as the read path: losing the hint is harmless.
  }
}
