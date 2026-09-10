import { skillIdFromPath } from "./github-parse";
import {
  confirmCandidates,
  fetchHeadTree,
  fetchTree,
  type ScanMiss,
  type ScanResult,
} from "./github-tree-fetch";
import {
  dirNameOf,
  isCandidateDir,
  matchSkillId,
  sortCandidateDirs,
} from "./skill-id-match";

/**
 * The two api.github.com tiers of the skill lookup (github-lookup.ts): the
 * cheap shallow scan and the expensive recursive scan. Both confirm fetched
 * candidates through `confirmCandidates` (github-tree-fetch.ts), so the
 * id-vs-directory tolerance (skill-id-match.ts) and the "proven absent vs.
 * could not read" distinction are one rule for every tier.
 */

/** Cap on how many candidate SKILL.md files the shallow scan will read. */
const SHALLOW_CANDIDATE_CAP = 6;
/**
 * Cap on confirmation reads in the recursive scan. Every SKILL.md in the repo
 * is a candidate (skills.sh keys on the declared `name:`, so a skill may live
 * under any directory), ordered likeliest first; raw-CDN reads are cheap and
 * concurrent, and a repo with more SKILL.md files than this yields
 * `incomplete`, never a proven absence.
 */
const RECURSIVE_CANDIDATE_CAP = 40;

export type { ScanMiss, ScanResult } from "./github-tree-fetch";

/**
 * Cheap middle tier: at most two NON-recursive Git Trees calls (the repo root,
 * then the `skills/` subtree if present) list top-level and `skills/*`
 * directory names. Directories that could stand for `skillId` are read and
 * the best-confirmed one wins. `skills/`-nested candidates rank ahead of
 * top-level ones, and more specific names ahead of loose ones, so the read
 * cap never drops the likeliest candidate. Exact directory matches were
 * already covered by the guess tier.
 */
export async function shallowScan(
  fetchImpl: typeof fetch,
  source: string,
  skillId: string,
): Promise<ScanResult> {
  const root = await fetchHeadTree(fetchImpl, source, false);
  if (root.kind === "miss") return root;

  const topLevel: string[] = [];
  let skillsSha: string | undefined;
  for (const entry of root.entries) {
    if (entry.type !== "tree") continue;
    if (entry.path === "skills") skillsSha = entry.sha;
    if (isCandidateDir(skillId, entry.path)) topLevel.push(entry.path);
  }

  const nested: string[] = [];
  let subtreeMiss: ScanMiss | null = null;
  if (skillsSha) {
    const sub = await fetchTree(fetchImpl, source, skillsSha, false);
    if (sub.kind === "ok")
      for (const entry of sub.entries) {
        if (entry.type === "tree" && isCandidateDir(skillId, entry.path))
          nested.push(entry.path);
      }
    else subtreeMiss = sub.reason;
  }

  const ordered = [
    ...sortCandidateDirs(skillId, nested).map((d) => `skills/${d}/SKILL.md`),
    ...sortCandidateDirs(skillId, topLevel).map((d) => `${d}/SKILL.md`),
  ];
  const result = await confirmCandidates(
    fetchImpl,
    source,
    skillId,
    ordered,
    SHALLOW_CANDIDATE_CAP,
  );
  // A `skills/` subtree we could not list may hold the skill: its own reason
  // (quota, transport) outranks a top-level "absent".
  if (result.kind === "miss" && result.reason === "absent" && subtreeMiss)
    return { kind: "miss", reason: subtreeMiss };
  return result;
}

/**
 * Locate a SKILL.md matching `skillId` via the RECURSIVE Git Trees API — one
 * call over the whole repo (expensive, rate-limited; install-only). Every
 * SKILL.md is read (capped) and confirmed by frontmatter, likeliest first: an
 * exact directory-name match, then directories that are a kebab prefix of the
 * id or paths containing it, then the rest — a skill declaring `name: ghost`
 * may sit under any directory, so absence is only proven once ALL of them were
 * read. A truncated listing cannot prove absence, so it reports `incomplete`.
 */
export async function recursiveScan(
  fetchImpl: typeof fetch,
  source: string,
  skillId: string,
): Promise<ScanResult> {
  const tree = await fetchHeadTree(fetchImpl, source, true);
  if (tree.kind === "miss") return tree;

  const repoName = source.split("/").at(-1) ?? source;
  const exact: string[] = [];
  const fuzzy: string[] = [];
  const rest: string[] = [];
  for (const entry of tree.entries) {
    if (entry.type !== "blob" || !entry.path.endsWith("SKILL.md")) continue;
    if (skillIdFromPath(entry.path, repoName) === skillId)
      exact.push(entry.path);
    else if (
      matchSkillId(skillId, dirNameOf(entry.path)) !== "none" ||
      entry.path.includes(skillId)
    )
      fuzzy.push(entry.path);
    else rest.push(entry.path);
  }
  fuzzy.sort((a, b) => dirNameOf(b).length - dirNameOf(a).length);

  const result = await confirmCandidates(
    fetchImpl,
    source,
    skillId,
    [...exact, ...fuzzy, ...rest],
    RECURSIVE_CANDIDATE_CAP,
  );
  if (result.kind === "miss" && result.reason === "absent" && tree.truncated)
    return { kind: "miss", reason: "incomplete" };
  return result;
}
