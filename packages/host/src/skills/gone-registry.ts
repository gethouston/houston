/**
 * Process-wide memory of community skills the install lookup PROVED absent
 * (PRODUCT-1729): a repo GitHub answers 404 for (deleted or renamed), or a
 * skill a full recursive scan of a live repo could not find. skills.sh keeps
 * indexing both for months, so without this the same dead card comes back on
 * every search and every click is another 404. `CommunityDirectory` filters
 * search and popular results against it; `locateSkillMd` writes to it.
 *
 * Only a certain miss is recorded. A rate-limited or truncated scan is not
 * proof of absence and never lands here. Entries expire after a day so an
 * author who restores a repo, or a re-indexed skill, comes back on its own.
 */

const GONE_TTL_MS = 24 * 60 * 60_000;
const GONE_MAX_ENTRIES = 1024;

export interface GoneRegistryOptions {
  now?: () => number;
  ttlMs?: number;
  maxEntries?: number;
}

export class GoneRegistry {
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  /** `owner/repo` for a gone repo, `owner/repo#skillId` for a gone skill. */
  private readonly entries = new Map<string, number>();

  constructor(opts: GoneRegistryOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.ttlMs = opts.ttlMs ?? GONE_TTL_MS;
    this.maxEntries = opts.maxEntries ?? GONE_MAX_ENTRIES;
  }

  /** GitHub answered 404 for the whole repo. */
  markRepoGone(source: string): void {
    this.store(source.toLowerCase());
  }

  /** A complete scan of a live repo found no SKILL.md for the id. */
  markSkillGone(source: string, skillId: string): void {
    this.store(`${source.toLowerCase()}#${skillId}`);
  }

  /** True when the repo, or (with `skillId`) that skill in it, is known gone. */
  isGone(source: string, skillId?: string): boolean {
    const repo = source.toLowerCase();
    if (this.live(repo)) return true;
    return skillId !== undefined && this.live(`${repo}#${skillId}`);
  }

  private live(key: string): boolean {
    const markedAt = this.entries.get(key);
    if (markedAt === undefined) return false;
    if (this.now() - markedAt <= this.ttlMs) return true;
    this.entries.delete(key);
    return false;
  }

  /** FIFO-capped insert; nothing else sweeps the map. */
  private store(key: string): void {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, this.now());
  }
}

/** The one instance the lookup writes and the directory reads. */
export const goneRegistry = new GoneRegistry();
