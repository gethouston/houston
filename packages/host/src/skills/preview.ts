import { parseSkillMd } from "@houston/domain";
import type { CommunitySkillPreview } from "@houston/protocol";
import { locateSkillMd } from "./github-lookup";
import { normalizeSource } from "./github-parse";
import { SkillRemoteError } from "./remote-error";

/**
 * Upper bound on the returned `content` body. A preview modal never needs more
 * than this, and the cap keeps the process-wide preview cache byte-bounded
 * (a community SKILL.md is author-controlled input of arbitrary size).
 */
export const MAX_PREVIEW_CONTENT_CHARS = 60_000;

/** Appended when a body was clipped at the cap, so the cut is never silent. */
export const PREVIEW_CONTENT_CLIPPED_MARKER = "\n\n[...]";

/**
 * Read-only preview of a community skill: fetch the SAME SKILL.md the install
 * flow would use (via the shared `locateSkillMd`) and parse the author's real
 * frontmatter, so the marketplace can show a true description/title/image/
 * category BEFORE the user commits to installing. Also returns the frontmatter
 * `integrations:` slugs (the apps the skill connects to) and the SKILL.md body
 * with frontmatter stripped, so the modal can show the real instructions.
 * No vfs write, no workspace. A SKILL.md that fails to parse yields the empty
 * shape rather than throwing — a preview should degrade to "no detail", never
 * error the browse.
 */
export async function previewCommunitySkill(
  fetchImpl: typeof fetch,
  rawSource: string,
  skillId: string,
): Promise<CommunitySkillPreview> {
  const source = normalizeSource(rawSource);
  if (!source)
    throw new SkillRemoteError("invalid_repo_source", rawSource.trim());
  // deepScan: false — the recursive tree-scan fallback is an expensive,
  // rate-limited GitHub API call; a preview isn't worth 10+ seconds and a
  // chunk of the hourly quota on every card click. A guess-path miss just
  // shows "couldn't load the description" (see the parse-failure branch
  // below) rather than making the browse feel like it hung.
  const rawMd = await locateSkillMd(fetchImpl, source, skillId, {
    deepScan: false,
  });
  const parsed = parseSkillMd(skillId, rawMd);
  if ("error" in parsed) {
    return {
      title: null,
      description: "",
      image: null,
      category: null,
      tags: [],
      integrations: [],
      content: null,
    };
  }
  return {
    title: parsed.summary.title,
    description: parsed.summary.description,
    image: parsed.summary.image,
    category: parsed.summary.category,
    tags: parsed.summary.tags,
    integrations: parsed.summary.integrations,
    // `parseSkillMd` already split the file — `body` IS the markdown with the
    // YAML frontmatter removed, so the modal never re-parses or re-strips it.
    content: clipContent(parsed.body),
  };
}

function clipContent(body: string): string {
  if (body.length <= MAX_PREVIEW_CONTENT_CHARS) return body;
  return (
    body.slice(0, MAX_PREVIEW_CONTENT_CHARS) + PREVIEW_CONTENT_CLIPPED_MARKER
  );
}

const PREVIEW_FRESH_TTL_MS = 24 * 60 * 60_000;
const PREVIEW_FAILURE_TTL_MS = 10 * 60_000;
const PREVIEW_MAX_ENTRIES = 256;

interface CachedPreview {
  /** The resolved preview, or the SkillRemoteError to re-throw (negative cache). */
  result: CommunitySkillPreview | { error: SkillRemoteError };
  fetchedAt: number;
}

export interface PreviewDirectoryOptions {
  now?: () => number;
  freshTtlMs?: number;
  failureTtlMs?: number;
  maxEntries?: number;
}

/**
 * In-memory cache around `previewCommunitySkill`, mirroring `CommunityDirectory`
 * (community.ts). Successful previews stay fresh for 24h; thrown
 * `SkillRemoteError`s are NEGATIVELY cached for 10 minutes so repeated clicks on
 * a permanently-missing skill don't refetch — EXCEPT `invalid_repo_source`,
 * which is a client bug (garbage input) not worth a cache slot and is rethrown
 * uncached. Keyed `${source}#${skillId}`. `fetchImpl` is passed per call (the
 * route already holds it per request), so ONE process-wide instance — held as a
 * module-level singleton in the route layer, like `CommunityDirectory` — serves
 * every request while keeping the class trivially injectable in tests via `now`.
 */
export class PreviewDirectory {
  private readonly now: () => number;
  private readonly freshTtlMs: number;
  private readonly failureTtlMs: number;
  private readonly maxEntries: number;
  private readonly entries = new Map<string, CachedPreview>();

  constructor(opts: PreviewDirectoryOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.freshTtlMs = opts.freshTtlMs ?? PREVIEW_FRESH_TTL_MS;
    this.failureTtlMs = opts.failureTtlMs ?? PREVIEW_FAILURE_TTL_MS;
    this.maxEntries = opts.maxEntries ?? PREVIEW_MAX_ENTRIES;
  }

  /**
   * Insert with FIFO eviction: entries now carry full SKILL.md bodies, and
   * nothing else ever sweeps the map (TTLs are only checked on read of the
   * SAME key), so the cap is what keeps a long browse session byte-bounded.
   * Re-setting an existing key refreshes its insertion order.
   */
  private store(key: string, value: CachedPreview): void {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, value);
  }

  async preview(
    fetchImpl: typeof fetch,
    source: string,
    skillId: string,
  ): Promise<CommunitySkillPreview> {
    const key = `${source}#${skillId}`;
    const cached = this.entries.get(key);
    if (cached) {
      const isFailure = "error" in cached.result;
      const ttl = isFailure ? this.failureTtlMs : this.freshTtlMs;
      if (this.now() - cached.fetchedAt <= ttl) {
        if ("error" in cached.result) throw cached.result.error;
        return cached.result;
      }
    }
    try {
      const result = await previewCommunitySkill(fetchImpl, source, skillId);
      this.store(key, { result, fetchedAt: this.now() });
      return result;
    } catch (err) {
      if (err instanceof SkillRemoteError && err.kind !== "invalid_repo_source")
        this.store(key, {
          result: { error: err },
          fetchedAt: this.now(),
        });
      throw err;
    }
  }
}
