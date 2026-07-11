import { parseSkillMd } from "@houston/domain";
import type { CommunitySkillPreview } from "@houston/protocol";
import { locateSkillMd } from "./github-lookup";
import { normalizeSource } from "./github-parse";
import { SkillRemoteError } from "./remote-error";

/**
 * Read-only preview of a community skill: fetch the SAME SKILL.md the install
 * flow would use (via the shared `locateSkillMd`) and parse the author's real
 * frontmatter, so the marketplace can show a true description/title/image/
 * category BEFORE the user commits to installing. No vfs write, no workspace.
 * A SKILL.md that fails to parse yields the empty shape rather than throwing —
 * a preview should degrade to "no detail", never error the browse.
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
    };
  }
  return {
    title: parsed.summary.title,
    description: parsed.summary.description,
    image: parsed.summary.image,
    category: parsed.summary.category,
    tags: parsed.summary.tags,
  };
}

const PREVIEW_FRESH_TTL_MS = 24 * 60 * 60_000;
const PREVIEW_FAILURE_TTL_MS = 10 * 60_000;

interface CachedPreview {
  /** The resolved preview, or the SkillRemoteError to re-throw (negative cache). */
  result: CommunitySkillPreview | { error: SkillRemoteError };
  fetchedAt: number;
}

export interface PreviewDirectoryOptions {
  now?: () => number;
  freshTtlMs?: number;
  failureTtlMs?: number;
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
  private readonly entries = new Map<string, CachedPreview>();

  constructor(opts: PreviewDirectoryOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.freshTtlMs = opts.freshTtlMs ?? PREVIEW_FRESH_TTL_MS;
    this.failureTtlMs = opts.failureTtlMs ?? PREVIEW_FAILURE_TTL_MS;
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
      this.entries.set(key, { result, fetchedAt: this.now() });
      return result;
    } catch (err) {
      if (err instanceof SkillRemoteError && err.kind !== "invalid_repo_source")
        this.entries.set(key, {
          result: { error: err },
          fetchedAt: this.now(),
        });
      throw err;
    }
  }
}
