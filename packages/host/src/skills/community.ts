import type { CommunitySkill } from "@houston/protocol";
import { fetchCommunitySearch } from "./community-fetch";

/**
 * skills.sh community directory client. The host owns the resilience the KB
 * documents for this surface: successful searches are cached in-memory,
 * outbound requests are globally spaced, and stale cached results are
 * returned during a temporary 429/network failure — so a rate-limited
 * marketplace degrades to slightly-old results instead of an error wall.
 */

const SEARCH_ENDPOINT = "https://skills.sh/api/search";
const SEARCH_RETRY_DELAY_MS = 3_000;
const SEARCH_FRESH_TTL_MS = 10 * 60_000;
const SEARCH_STALE_TTL_MS = 24 * 60 * 60_000;
const SEARCH_MIN_INTERVAL_MS = 750;
/** Upper bound on one skills.sh round-trip. A wedged upstream must surface as
 *  the typed `upstream_timeout` error, never hang the host route (or a test)
 *  open. */
const SEARCH_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Seed query for the "popular" feed. skills.sh has no dedicated popular
 * endpoint, but /api/search returns results sorted by install count
 * regardless of relevance, so any broad term works. Cached 24h on its own
 * slot so it never competes with user-typed search.
 */
const POPULAR_SEED = "ai";
const POPULAR_FRESH_TTL_MS = 24 * 60 * 60_000;
const POPULAR_LIMIT = 20;

interface CachedSearch {
  skills: CommunitySkill[];
  fetchedAt: number;
}

export interface CommunityDirectoryOptions {
  fetchImpl?: typeof fetch;
  endpoint?: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  retryDelayMs?: number;
  minIntervalMs?: number;
  requestTimeoutMs?: number;
  freshTtlMs?: number;
  staleTtlMs?: number;
  popularFreshTtlMs?: number;
}

/** Per-request overrides that preserve process-wide cache and rate spacing. */
export interface CommunitySearchOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal | null;
}

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class CommunityDirectory {
  private readonly fetchImpl: typeof fetch;
  private readonly endpoint: string;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly retryDelayMs: number;
  private readonly minIntervalMs: number;
  private readonly requestTimeoutMs: number;
  private readonly freshTtlMs: number;
  private readonly staleTtlMs: number;
  private readonly popularFreshTtlMs: number;

  private readonly entries = new Map<string, CachedSearch>();
  private popularEntry: CachedSearch | null = null;
  /** Earliest timestamp the next outbound request may fire (global spacing). */
  private nextAllowedRequest = 0;

  constructor(opts: CommunityDirectoryOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.endpoint = opts.endpoint ?? SEARCH_ENDPOINT;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? realSleep;
    this.retryDelayMs = opts.retryDelayMs ?? SEARCH_RETRY_DELAY_MS;
    this.minIntervalMs = opts.minIntervalMs ?? SEARCH_MIN_INTERVAL_MS;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? SEARCH_REQUEST_TIMEOUT_MS;
    this.freshTtlMs = opts.freshTtlMs ?? SEARCH_FRESH_TTL_MS;
    this.staleTtlMs = opts.staleTtlMs ?? SEARCH_STALE_TTL_MS;
    this.popularFreshTtlMs = opts.popularFreshTtlMs ?? POPULAR_FRESH_TTL_MS;
  }

  /** Search with shared cache/spacing and optional request-scoped I/O. */
  async search(
    query: string,
    opts: CommunitySearchOptions = {},
  ): Promise<CommunitySkill[]> {
    const trimmed = query.trim();
    if ([...trimmed].length < 2) return [];
    const key = trimmed.toLowerCase();

    const cached = this.entries.get(key);
    if (cached && this.now() - cached.fetchedAt <= this.freshTtlMs)
      return cached.skills;

    await this.waitForRequestSlot();
    try {
      const skills = await this.fetchSearch(trimmed, opts);
      this.entries.set(key, { skills, fetchedAt: this.now() });
      return skills;
    } catch (err) {
      if (opts.signal?.aborted) throw opts.signal.reason ?? err;
      const stale = this.entries.get(key);
      if (stale && this.now() - stale.fetchedAt <= this.staleTtlMs) {
        console.warn(
          `[host-skills] community search failed, returning cached results: ${err}`,
        );
        return stale.skills;
      }
      throw err;
    }
  }

  /** Popular feed with shared cache/spacing and optional request-scoped I/O. */
  async popular(opts: CommunitySearchOptions = {}): Promise<CommunitySkill[]> {
    const fresh = this.popularEntry;
    if (fresh && this.now() - fresh.fetchedAt <= this.popularFreshTtlMs)
      return fresh.skills.slice(0, POPULAR_LIMIT);

    await this.waitForRequestSlot();
    try {
      const skills = await this.fetchSearch(POPULAR_SEED, opts);
      this.popularEntry = { skills, fetchedAt: this.now() };
      return skills.slice(0, POPULAR_LIMIT);
    } catch (err) {
      if (opts.signal?.aborted) throw opts.signal.reason ?? err;
      const stale = this.popularEntry;
      if (stale && this.now() - stale.fetchedAt <= this.staleTtlMs) {
        console.warn(
          `[host-skills] popular feed fetch failed, returning cached results: ${err}`,
        );
        return stale.skills.slice(0, POPULAR_LIMIT);
      }
      throw err;
    }
  }

  /** Reserve the next outbound slot and wait until it opens. */
  private async waitForRequestSlot(): Promise<void> {
    const now = this.now();
    const target = Math.max(this.nextAllowedRequest, now);
    this.nextAllowedRequest = target + this.minIntervalMs;
    if (target > now) await this.sleep(target - now);
  }

  /** One search round-trip, typed by cause (see `community-fetch.ts`). */
  private fetchSearch(
    query: string,
    opts: CommunitySearchOptions,
  ): Promise<CommunitySkill[]> {
    return fetchCommunitySearch({
      endpoint: this.endpoint,
      query,
      fetchImpl: opts.fetchImpl ?? this.fetchImpl,
      signal: opts.signal ?? null,
      timeoutMs: this.requestTimeoutMs,
      retryDelayMs: this.retryDelayMs,
      sleep: this.sleep,
    });
  }
}
