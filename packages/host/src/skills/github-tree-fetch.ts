import { readSkillMdAtPath } from "./github";
import { pickBestCandidate, type ScoredCandidate } from "./skill-id-match";

/**
 * The api.github.com primitives behind the tree scans (github-tree-scan.ts):
 * one Git Trees listing typed by WHY it came back empty, the repo-endpoint
 * confirmation a tree 404 needs, and the candidate confirmation step that
 * keeps "read and rejected" apart from "could not read".
 */

const GH_HEADERS = { "User-Agent": "houston-skills/1.0" };

export type TreeEntry = { path: string; type: string; sha?: string };

/**
 * Why a scan came back empty. Only `absent` is proof: every listed candidate
 * was read and rejected. `repo_gone` is GitHub's 404 for the repository
 * itself (deleted, renamed, or private; skills.sh keeps listing it for
 * months). `rate_limited` (403/429) and `unreachable` (a transport failure, an
 * unusable answer, or a listed candidate whose raw read failed with anything
 * but a 404) say nothing about the repo, and `incomplete` means the listing
 * was truncated or a fetch cap left candidates unread. The caller must NOT
 * record any of those three as a proven miss. A listed directory whose
 * SKILL.md 404s is ordinary absence: the shallow scan lists directories, not
 * SKILL.md files.
 */
export type ScanMiss =
  | "absent"
  | "repo_gone"
  | "rate_limited"
  | "unreachable"
  | "incomplete";

export type ScanResult =
  | { kind: "found"; candidate: ScoredCandidate }
  | { kind: "miss"; reason: ScanMiss };

export type TreeFetch =
  | { kind: "ok"; entries: TreeEntry[]; truncated: boolean }
  | { kind: "miss"; reason: ScanMiss };

export async function fetchTree(
  fetchImpl: typeof fetch,
  source: string,
  ref: string,
  recursive: boolean,
): Promise<TreeFetch> {
  const url = `https://api.github.com/repos/${source}/git/trees/${ref}${
    recursive ? "?recursive=1" : ""
  }`;
  const res = await fetchImpl(url, { headers: GH_HEADERS }).catch(() => null);
  if (!res) return { kind: "miss", reason: "unreachable" };
  if (res.status === 404) return { kind: "miss", reason: "repo_gone" };
  if (res.status === 403 || res.status === 429)
    return { kind: "miss", reason: "rate_limited" };
  if (!res.ok) return { kind: "miss", reason: "unreachable" };
  const body = (await res.json().catch(() => null)) as {
    tree?: TreeEntry[];
    truncated?: boolean;
  } | null;
  if (!body || !Array.isArray(body.tree))
    return { kind: "miss", reason: "unreachable" };
  return { kind: "ok", entries: body.tree, truncated: body.truncated === true };
}

/**
 * A tree 404 alone is "resource not found": the ref, or a repo GitHub hides.
 * Only the repository endpoint's own 404 proves the repo is gone, so it is
 * confirmed there (one extra call, only on this rare path) before the caller
 * hides the whole repo for a day.
 */
async function confirmRepoGone(
  fetchImpl: typeof fetch,
  source: string,
): Promise<ScanMiss> {
  const res = await fetchImpl(`https://api.github.com/repos/${source}`, {
    headers: GH_HEADERS,
  }).catch(() => null);
  if (!res) return "unreachable";
  if (res.status === 404) return "repo_gone";
  if (res.status === 403 || res.status === 429) return "rate_limited";
  return "unreachable";
}

/** The HEAD tree, with a 404 confirmed against the repo endpoint. */
export async function fetchHeadTree(
  fetchImpl: typeof fetch,
  source: string,
  recursive: boolean,
): Promise<TreeFetch> {
  const tree = await fetchTree(fetchImpl, source, "HEAD", recursive);
  if (tree.kind === "miss" && tree.reason === "repo_gone")
    return { kind: "miss", reason: await confirmRepoGone(fetchImpl, source) };
  return tree;
}

/**
 * Read and confirm candidate paths (already priority-ordered), honouring
 * `cap`. Any failed (non-404) read makes the miss `unreachable` and any
 * capped-off candidate makes it `incomplete`: neither may be recorded as
 * absence.
 */
export async function confirmCandidates(
  fetchImpl: typeof fetch,
  source: string,
  skillId: string,
  ordered: string[],
  cap: number,
): Promise<ScanResult> {
  const paths = ordered.slice(0, cap);
  if (paths.length === 0) return { kind: "miss", reason: "absent" };
  const reads = await Promise.all(
    paths.map((path) => readSkillMdAtPath(fetchImpl, source, path)),
  );
  const fetched = paths.map((path, i) => {
    const read = reads[i];
    return { path, rawMd: read?.kind === "ok" ? read.rawMd : null };
  });
  const best = pickBestCandidate(skillId, fetched);
  if (best) return { kind: "found", candidate: best };
  if (reads.some((r) => r.kind === "failed"))
    return { kind: "miss", reason: "unreachable" };
  if (ordered.length > cap) return { kind: "miss", reason: "incomplete" };
  return { kind: "miss", reason: "absent" };
}
