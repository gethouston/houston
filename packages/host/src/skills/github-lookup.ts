import { fetchSkillMdAtPath } from "./github";
import { extractFrontmatterName, skillIdFromPath } from "./github-parse";
import { SkillRemoteError } from "./remote-error";

const GH_HEADERS = { "User-Agent": "houston-skills/1.0" };
/** Cap on how many fuzzy SKILL.md candidates the shallow scan will fetch. */
const SHALLOW_CANDIDATE_CAP = 6;

export interface LocateSkillMdOptions {
  /**
   * Escalate to the recursive Git Trees scan when the cheaper tiers miss.
   * Lookup runs in three tiers, cheapest first:
   *   1. Common path guesses — raw-CDN fetches, no `api.github.com` call.
   *   2. Shallow tree scan (ALWAYS run) — at most two SMALL non-recursive
   *      `api.github.com` calls (the repo root, then the `skills/` subtree if
   *      present); fuzzy-matches directory names against `skillId` and confirms
   *      the winner by its frontmatter `name:`. Finds the common "declared slug
   *      differs from the directory name" shape (e.g. `skills/use-ai-sdk/` with
   *      `name: ai-sdk`) cheaply.
   *   3. Recursive tree scan — ONE big `?recursive=1` call over the WHOLE repo
   *      (measured 10+ seconds and a large chunk of the 60-req/hour
   *      unauthenticated `api.github.com` rate limit on a real monorepo).
   *      Install (`true`, the default) needs it for a genuinely unguessable
   *      nested skill; the read-only preview flow passes `false` — a preview
   *      miss just shows "couldn't load the description" and isn't worth the
   *      cost on every marketplace card click. Install still works.
   */
  deepScan?: boolean;
}

/**
 * Shared "find the SKILL.md for `skillId` in `source`" lookup, used by both the
 * install flow (install.ts) and the read-only preview flow (preview.ts) so the
 * two never drift. `source` is an already-normalized `owner/repo`. Runs the
 * three tiers documented on {@link LocateSkillMdOptions.deepScan} — cheap path
 * guesses, then a shallow tree scan, then (install only) the recursive scan —
 * and returns the raw SKILL.md text or throws `skill_not_in_repo`.
 */
export async function locateSkillMd(
  fetchImpl: typeof fetch,
  source: string,
  skillId: string,
  opts: LocateSkillMdOptions = {},
): Promise<string> {
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

  // Tier 2 — shallow scan, always (≤2 small non-recursive api.github.com calls).
  const shallow = await shallowFindSkillPath(fetchImpl, source, skillId);
  if (shallow) return shallow.rawMd;

  // Tier 3 — recursive scan, expensive; install-only (deepScan).
  if (opts.deepScan ?? true) {
    const path = await findSkillPathInRepo(fetchImpl, source, skillId).catch(
      () => null,
    );
    if (path) {
      const rawMd = await fetchSkillMdAtPath(fetchImpl, source, path).catch(
        () => null,
      );
      if (rawMd !== null) return rawMd;
    }
  }

  throw new SkillRemoteError(
    "skill_not_in_repo",
    `Could not find '${skillId}' in ${source}`,
  );
}

type TreeEntry = { path: string; type: string; sha?: string };

/** One NON-recursive Git Trees call, parsed to its entries; null on any miss. */
async function fetchTree(
  fetchImpl: typeof fetch,
  source: string,
  ref: string,
): Promise<TreeEntry[] | null> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${source}/git/trees/${ref}`,
    { headers: GH_HEADERS },
  ).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    tree?: TreeEntry[];
  } | null;
  return body && Array.isArray(body.tree) ? body.tree : null;
}

/**
 * Cheap middle tier: at most two NON-recursive Git Trees calls (the repo root,
 * then the `skills/` subtree if present) list top-level and `skills/*`
 * directory names, we fuzzy-match those against `skillId` (either contains the
 * other, case-insensitive), and confirm the winner by its frontmatter `name:`.
 * This resolves the common "author-declared slug differs from the directory
 * name" shape without the recursive scan's cost. Returns the matching path AND
 * its already-fetched content so `locateSkillMd` needn't re-fetch. null on any
 * miss. Exact directory matches were already covered by the guess tier, so a
 * fuzzy-only match here is enough (an exact one matching again is harmless).
 */
async function shallowFindSkillPath(
  fetchImpl: typeof fetch,
  source: string,
  skillId: string,
): Promise<{ path: string; rawMd: string } | null> {
  const root = await fetchTree(fetchImpl, source, "HEAD");
  if (!root) return null;

  const id = skillId.toLowerCase();
  const fuzzy = (name: string): boolean => {
    const n = name.toLowerCase();
    return n.includes(id) || id.includes(n);
  };

  // `skills/`-nested candidates rank ahead of top-level ones.
  const topLevel: string[] = [];
  let skillsSha: string | undefined;
  for (const entry of root) {
    if (entry.type !== "tree") continue;
    if (entry.path === "skills") skillsSha = entry.sha;
    if (fuzzy(entry.path)) topLevel.push(`${entry.path}/SKILL.md`);
  }

  const nested: string[] = [];
  if (skillsSha) {
    const sub = await fetchTree(fetchImpl, source, skillsSha);
    for (const entry of sub ?? []) {
      if (entry.type === "tree" && fuzzy(entry.path))
        nested.push(`skills/${entry.path}/SKILL.md`);
    }
  }

  const paths = [...nested, ...topLevel].slice(0, SHALLOW_CANDIDATE_CAP);
  if (paths.length === 0) return null;

  const fetched = await Promise.allSettled(
    paths.map((path) => fetchSkillMdAtPath(fetchImpl, source, path)),
  );
  for (let i = 0; i < paths.length; i++) {
    const result = fetched[i];
    const path = paths[i];
    if (
      path &&
      result?.status === "fulfilled" &&
      extractFrontmatterName(result.value) === skillId
    )
      return { path, rawMd: result.value };
  }
  return null;
}

/**
 * Locate a SKILL.md matching `skillId` via the RECURSIVE Git Trees API — one
 * call over the whole repo (expensive, rate-limited; install-only). Two passes:
 * exact directory-name match first, then peek at frontmatter `name:` for paths
 * containing the id (capped at 10 fetches).
 */
async function findSkillPathInRepo(
  fetchImpl: typeof fetch,
  source: string,
  skillId: string,
): Promise<string | null> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${source}/git/trees/HEAD?recursive=1`,
    { headers: GH_HEADERS },
  );
  if (!res.ok) return null;
  const tree = (await res.json().catch(() => null)) as {
    tree?: Array<{ path: string; type: string }>;
  } | null;
  if (!tree || !Array.isArray(tree.tree)) return null;

  const repoName = source.split("/").at(-1) ?? source;
  const fuzzy: string[] = [];
  for (const entry of tree.tree) {
    if (entry.type !== "blob" || !entry.path.endsWith("SKILL.md")) continue;
    if (skillIdFromPath(entry.path, repoName) === skillId) return entry.path;
    if (entry.path.includes(skillId)) fuzzy.push(entry.path);
  }
  for (const path of fuzzy.slice(0, 10)) {
    const content = await fetchSkillMdAtPath(fetchImpl, source, path).catch(
      () => null,
    );
    if (content !== null && extractFrontmatterName(content) === skillId)
      return path;
  }
  return null;
}
