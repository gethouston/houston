import type { CommunitySkill } from "@houston/protocol";
import { SkillRemoteError } from "./remote-error";

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
  freshTtlMs?: number;
  staleTtlMs?: number;
  popularFreshTtlMs?: number;
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
    this.freshTtlMs = opts.freshTtlMs ?? SEARCH_FRESH_TTL_MS;
    this.staleTtlMs = opts.staleTtlMs ?? SEARCH_STALE_TTL_MS;
    this.popularFreshTtlMs = opts.popularFreshTtlMs ?? POPULAR_FRESH_TTL_MS;
  }

  async search(query: string): Promise<CommunitySkill[]> {
    const trimmed = query.trim();
    if ([...trimmed].length < 2) return [];
    const key = trimmed.toLowerCase();

    const cached = this.entries.get(key);
    if (cached && this.now() - cached.fetchedAt <= this.freshTtlMs)
      return cached.skills;

    await this.waitForRequestSlot();
    try {
      const skills = await this.fetchSearch(trimmed);
      this.entries.set(key, { skills, fetchedAt: this.now() });
      return skills;
    } catch (err) {
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

  async popular(): Promise<CommunitySkill[]> {
    const fresh = this.popularEntry;
    if (fresh && this.now() - fresh.fetchedAt <= this.popularFreshTtlMs)
      return fresh.skills.slice(0, POPULAR_LIMIT);

    await this.waitForRequestSlot();
    try {
      const skills = await this.fetchSearch(POPULAR_SEED);
      this.popularEntry = { skills, fetchedAt: this.now() };
      return skills.slice(0, POPULAR_LIMIT);
    } catch (err) {
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

  /** One search round-trip. Retries once after a delay on HTTP 429. */
  private async fetchSearch(query: string): Promise<CommunitySkill[]> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(
          `${this.endpoint}?q=${encodeURIComponent(query)}`,
          { headers: { "User-Agent": "houston-skills/1.0" } },
        );
      } catch (err) {
        throw new SkillRemoteError(
          "offline",
          `skills.sh search failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (res.status === 429 && attempt === 0) {
        await this.sleep(this.retryDelayMs);
        continue;
      }
      if (res.status === 429) {
        throw new SkillRemoteError(
          "rate_limited",
          "skills.sh rate limit hit, wait a moment and try again",
        );
      }
      if (!res.ok) {
        throw new SkillRemoteError(
          "offline",
          `Skills search failed (${res.status})`,
        );
      }

      const body = (await res.json().catch(() => null)) as {
        skills?: unknown;
      } | null;
      if (!body || !Array.isArray(body.skills)) {
        throw new SkillRemoteError("offline", "Failed to parse results");
      }
      return body.skills as CommunitySkill[];
    }
  }
}
