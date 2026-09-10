import { fetchSkillMdAtPath } from "./github";
import { recursiveScan, type ScanMiss, shallowScan } from "./github-tree-scan";
import { type GoneRegistry, goneRegistry } from "./gone-registry";
import { probePluginMarketplace } from "./plugin-marketplace";
import { SkillRemoteError } from "./remote-error";

export interface LocateSkillMdOptions {
  /**
   * Escalate to the recursive Git Trees scan when the cheaper tiers miss.
   * Lookup runs in four tiers, cheapest first:
   *   1. Common path guesses — raw-CDN fetches, no `api.github.com` call.
   *   1.5. Plugin-marketplace probe (ALWAYS run, raw-CDN only) — repos whose
   *      `.claude-plugin/marketplace.json` manifest exists keep skills at
   *      `<plugin>/skills/<skillId>/SKILL.md`; the manifest lists the plugin
   *      roots to probe (plugin-marketplace.ts, PRODUCT-1382).
   *   2. Shallow tree scan (ALWAYS run) — at most two SMALL non-recursive
   *      `api.github.com` calls (the repo root, then the `skills/` subtree if
   *      present); matches directory names against `skillId` and confirms
   *      the winner by its frontmatter `name:` (github-tree-scan.ts). Finds
   *      the common "declared slug differs from the directory name" shape
   *      (e.g. `skills/use-ai-sdk/` with `name: ai-sdk`) cheaply.
   *   3. Recursive tree scan — ONE big `?recursive=1` call over the WHOLE repo
   *      (measured 10+ seconds and a large chunk of the 60-req/hour
   *      unauthenticated `api.github.com` rate limit on a real monorepo).
   *      Install (`true`, the default) needs it for a genuinely unguessable
   *      nested skill; the read-only preview flow passes `false` — a preview
   *      miss just shows "couldn't load the description" and isn't worth the
   *      cost on every marketplace card click. Install still works.
   *
   * Every confirming tier tolerates the two ways a skills.sh id drifts from
   * the repo (skill-id-match.ts, PRODUCT-1729): the index slugifies the
   * declared `name:` (`pdf-ocr/` declaring `PDF OCR Extraction` is listed as
   * `pdf-ocr-extraction`), and a skill renamed upstream keeps its old id as a
   * kebab prefix (`user-research-synthesis` → `user-research/`).
   */
  deepScan?: boolean;
  /** Where proven misses are recorded; the process singleton by default. */
  gone?: GoneRegistry;
}

/**
 * Shared "find the SKILL.md for `skillId` in `source`" lookup, used by both the
 * install flow (install.ts) and the read-only preview flow (preview.ts) so the
 * two never drift. `source` is an already-normalized `owner/repo`. Runs the
 * tiers documented on {@link LocateSkillMdOptions.deepScan} — cheap path
 * guesses, the plugin-marketplace probe, a shallow tree scan, then (install
 * only) the recursive scan — and returns the raw SKILL.md text or throws:
 *
 *   - `repo_not_found` when GitHub answers 404 for the repo itself (deleted,
 *     renamed, or private) — recorded in the gone registry so search stops
 *     listing the repo's skills;
 *   - `github_rate_limited` / `offline` when the api.github.com tiers could
 *     not run, so a quota or transport miss never reads as "the author
 *     removed this skill";
 *   - `skill_not_in_repo` otherwise — recorded in the registry only when the
 *     recursive scan ran to completion and proved the absence.
 */
export async function locateSkillMd(
  fetchImpl: typeof fetch,
  source: string,
  skillId: string,
  opts: LocateSkillMdOptions = {},
): Promise<string> {
  const gone = opts.gone ?? goneRegistry;
  // Tier 1 — common path patterns, cheap (no api.github.com call). Tried
  // concurrently but priority-ordered: prefer candidates[0]'s result over
  // [1]'s over [2]'s when more than one happens to exist.
  const candidates = [
    `skills/${skillId}/SKILL.md`,
    `${skillId}/SKILL.md`,
    "SKILL.md",
  ];
  const attempts = await Promise.allSettled(
    candidates.map((candidate) =>
      fetchSkillMdAtPath(fetchImpl, source, candidate),
    ),
  );
  for (const attempt of attempts) {
    if (attempt.status === "fulfilled") return attempt.value;
  }

  // Tier 1.5 — plugin-marketplace probe, always; raw-CDN only. Runs BEFORE the
  // shallow scan so marketplace repos never spend api.github.com quota.
  const marketplaceMd = await probePluginMarketplace(
    fetchImpl,
    source,
    skillId,
  );
  if (marketplaceMd !== null) return marketplaceMd;

  // Tier 2 — shallow scan, always (≤2 small non-recursive api.github.com calls).
  const shallow = await shallowScan(fetchImpl, source, skillId);
  if (shallow.kind === "found") return shallow.candidate.rawMd;
  if (shallow.reason === "repo_gone") throw repoGone(gone, source, skillId);

  // Tier 3 — recursive scan, expensive; install-only (deepScan). A preview
  // reports the shallow miss as-is: a shallow "absent" is not proof (the skill
  // may be nested), so nothing is recorded.
  if (!(opts.deepScan ?? true))
    throw missError(source, skillId, shallow.reason);
  const deep = await recursiveScan(fetchImpl, source, skillId);
  if (deep.kind === "found") return deep.candidate.rawMd;
  if (deep.reason === "repo_gone") throw repoGone(gone, source, skillId);
  // Only a COMPLETE listing with every candidate read proves the skill is
  // gone; anything less is a plain miss that must not poison search for a day.
  if (deep.reason === "absent") gone.markSkillGone(source, skillId);
  throw missError(source, skillId, deep.reason);
}

function repoGone(
  gone: GoneRegistry,
  source: string,
  skillId: string,
): SkillRemoteError {
  gone.markRepoGone(source);
  return new SkillRemoteError(
    "repo_not_found",
    `GitHub answered 404 for ${source} while looking for '${skillId}'`,
  );
}

/** The typed error for a scan miss: quota and transport keep their own kinds
 *  so they never read as "the author removed this skill". */
function missError(
  source: string,
  skillId: string,
  reason: Exclude<ScanMiss, "repo_gone">,
): SkillRemoteError {
  if (reason === "rate_limited")
    return new SkillRemoteError(
      "github_rate_limited",
      `GitHub rate limit hit while listing ${source} for '${skillId}'`,
    );
  if (reason === "unreachable")
    return new SkillRemoteError(
      "offline",
      `Could not read ${source} while looking for '${skillId}'`,
    );
  return new SkillRemoteError(
    "skill_not_in_repo",
    `Could not find '${skillId}' in ${source}`,
  );
}
