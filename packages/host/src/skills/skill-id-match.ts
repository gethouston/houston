import { extractFrontmatterName, slugifyInstallId } from "./github-parse";

/**
 * How a candidate SKILL.md stands for a skills.sh id. skills.sh derives its id
 * from the SLUGIFIED frontmatter `name:` at index time, so the id can differ
 * from the directory name in two real shapes (PRODUCT-1729):
 *
 *   - `pdf-ocr/SKILL.md` declares `name: PDF OCR Extraction`; the index lists
 *     `pdf-ocr-extraction`. Slugifying the declared name recovers the id.
 *   - `user-research/SKILL.md` was renamed upstream after the index recorded
 *     `user-research-synthesis`; nothing in the repo carries the suffix any
 *     more. The id still STARTS with the folder / declared slug.
 *
 * A prefix only counts when the shorter slug has at least two kebab segments:
 * `user-research` may stand for `user-research-synthesis`, but a bare `user`
 * or `pdf` directory is far too loose to install in the id's name.
 */
export type SkillIdMatch = "exact" | "prefix" | "none";

const MIN_PREFIX_SEGMENTS = 2;

/** The match between a skills.sh id and one directory name or declared `name:`. */
export function matchSkillId(
  skillId: string,
  candidate: string | null | undefined,
): SkillIdMatch {
  if (!candidate) return "none";
  const slug = slugifyInstallId(candidate);
  if (slug === skillId) return "exact";
  const segments = slug.split("-").filter(Boolean).length;
  if (segments >= MIN_PREFIX_SEGMENTS && skillId.startsWith(`${slug}-`))
    return "prefix";
  return "none";
}

/** True when the directory alone is worth fetching to confirm by frontmatter. */
export function isCandidateDir(skillId: string, dirName: string): boolean {
  const n = dirName.toLowerCase();
  const id = skillId.toLowerCase();
  return n.includes(id) || id.includes(n) || matchSkillId(id, n) !== "none";
}

/**
 * Confidence that a fetched SKILL.md IS the skill the id names. Higher wins; 0
 * is a miss. An exact match on the slugified `name:` (what skills.sh indexed)
 * or on the directory (what the guess tier already trusts) stands alone. A
 * prefix match only counts when the directory AND the declared name agree on
 * the same shorter slug: a renamed skill keeps both in step, whereas
 * `user-research/SKILL.md` declaring `name: competitor-analysis` is some other
 * skill that happens to live under a matching folder, and installing it in
 * the id's name would be worse than a 404.
 */
export function candidateScore(
  skillId: string,
  dirName: string,
  rawMd: string,
): number {
  const fmName = extractFrontmatterName(rawMd);
  const byName = matchSkillId(skillId, fmName);
  const byDir = matchSkillId(skillId, dirName);
  if (byName === "exact") return 4;
  if (byDir === "exact") return 3;
  if (
    byName === "prefix" &&
    byDir === "prefix" &&
    fmName !== null &&
    slugifyInstallId(fmName) === slugifyInstallId(dirName)
  )
    return 2;
  return 0;
}

export interface ScoredCandidate {
  path: string;
  rawMd: string;
}

/**
 * The best-scoring fetched candidate, or null when none matches. Ties keep the
 * earlier entry so callers' priority order (nested before top-level, longer
 * directory names before shorter) is the tie-break.
 */
export function pickBestCandidate(
  skillId: string,
  fetched: Array<{ path: string; rawMd: string | null }>,
): ScoredCandidate | null {
  let best: { score: number; candidate: ScoredCandidate } | null = null;
  for (const { path, rawMd } of fetched) {
    if (rawMd === null) continue;
    const score = candidateScore(skillId, dirNameOf(path), rawMd);
    if (score > 0 && (best === null || score > best.score))
      best = { score, candidate: { path, rawMd } };
  }
  return best?.candidate ?? null;
}

/** `design/skills/user-research/SKILL.md` → `user-research`; root → "". */
export function dirNameOf(path: string): string {
  const parts = path.split("/");
  return parts.length >= 2 ? (parts[parts.length - 2] ?? "") : "";
}

/**
 * Order candidate directory names most-specific first: an exact or prefix
 * match on the id before a loose "contains" match, then longer names before
 * shorter ones, so a fetch cap never drops the likeliest candidate.
 */
export function sortCandidateDirs(skillId: string, dirs: string[]): string[] {
  const weight = (dir: string) =>
    matchSkillId(skillId, dir) === "none" ? 0 : 1;
  return [...dirs].sort((a, b) => weight(b) - weight(a) || b.length - a.length);
}
