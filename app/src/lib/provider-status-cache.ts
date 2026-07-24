import type { ProviderStatus } from "./tauri";

/**
 * Boot-time cache of the last provider-status scan, keyed PER ACTIVE SPACE.
 *
 * Provider probes shell out to CLIs and can take seconds each (up to a 5s
 * timeout per provider), so the settings screen seeds its cards from this
 * snapshot and paints instantly; the live probe still runs and reconciles.
 * Same philosophy as the i18n locale flash-cache: localStorage is never the
 * source of truth, only a first-paint hint.
 *
 * The snapshot is scoped by the active space (C8) because provider connections
 * are tenant data — a team's connected providers differ from the personal
 * space's. A single global key (the old `.v1`) leaked one space's connected
 * cards into another on a switch (HOU-906), because the seed is a localStorage
 * read that the query-cache reset can't reach. Scoping the key by the active
 * org slug (personal ⇒ the fixed `"personal"` scope, resolved the same way the
 * engine adapter pins `x-houston-org` — `window.__HOUSTON_ACTIVE_ORG__`) makes
 * the seed self-scope: a switch reads the new space's own snapshot (or none).
 */
const CACHE_KEY_PREFIX = "houston.providerStatusCache.v2";

/** The old un-scoped (cross-space-leaking) key. Orphaned by the `.v2` bump. */
const LEGACY_CACHE_KEY = "houston.providerStatusCache.v1";

/**
 * The active-space scope for the cache key: the team org slug pinned on
 * `window.__HOUSTON_ACTIVE_ORG__`, or the fixed `"personal"` scope when no
 * team is active (null/absent global — the same signal the engine adapter uses
 * to send no `x-houston-org` header).
 */
function activeScope(): string {
  if (typeof window === "undefined") return "personal";
  return window.__HOUSTON_ACTIVE_ORG__ ?? "personal";
}

function scopedCacheKey(scope: string): string {
  return `${CACHE_KEY_PREFIX}.${scope}`;
}

/**
 * One-time removal of the orphaned un-scoped `.v1` snapshot, so a stale global
 * hint can never re-seed a card after the `.v2` scope bump. Runs once at module
 * load (idempotent — removing an absent key is a no-op); guarded so a
 * non-browser (test/SSR) import is a no-op.
 */
export function purgeLegacyProviderStatusCache(
  storage: Pick<Storage, "removeItem"> | undefined = typeof localStorage !==
  "undefined"
    ? localStorage
    : undefined,
): void {
  try {
    storage?.removeItem(LEGACY_CACHE_KEY);
  } catch {
    // A blocked/absent store just means the orphan lingers harmlessly under its
    // dead key — it is never read again.
  }
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

/**
 * Last-known statuses, keyed by provider id. Invalid or unparseable entries
 * are dropped rather than trusted — a bad hint is worse than no hint.
 */
export function loadCachedProviderStatuses(
  storage: StatusStore = localStorage,
  scope: string = activeScope(),
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
    // Cache read is a paint hint, not a user action — a broken/blocked
    // localStorage just means we fall back to the probe-only path.
    return {};
  }
}

export function saveCachedProviderStatuses(
  statuses: Record<string, ProviderStatus>,
  storage: StatusStore = localStorage,
  scope: string = activeScope(),
): void {
  try {
    storage.setItem(scopedCacheKey(scope), JSON.stringify(statuses));
  } catch {
    // Same rationale as the read path: losing the hint is harmless.
  }
}
