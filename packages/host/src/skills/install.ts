import {
  composeInstalledSkillMd,
  parseSkillMd,
  skillKey,
} from "@houston/domain";
import type { RepoSkill } from "@houston/protocol";
import type { Vfs } from "../vfs";
import { fetchSkillMdAtPath } from "./github";
import {
  extractFrontmatterName,
  isValidSkillSlug,
  normalizeSource,
  parseRemoteSkillMd,
  skillIdFromPath,
  slugifyInstallId,
} from "./github-parse";
import { SkillRemoteError } from "./remote-error";

/**
 * Install composition for community/repo skills, mirroring the legacy Rust
 * engine's semantics: the fetched SKILL.md keeps the author's frontmatter,
 * the install slug owns both the directory and the frontmatter `name`, and
 * installing something already present is an idempotent success (a healthy
 * copy is preserved with local edits; a corrupt one is healed by rewrite).
 */

/** True when a healthy skill already sits at `slug` (idempotent no-op). */
async function healthyInstalled(
  vfs: Vfs,
  root: string,
  slug: string,
): Promise<boolean> {
  const existing = await vfs.readText(skillKey(root, slug));
  return existing !== null && !("error" in parseSkillMd(slug, existing));
}

async function writeInstall(
  vfs: Vfs,
  root: string,
  slug: string,
  rawMd: string,
  fallbackDescription: string,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await vfs.writeText(
    skillKey(root, slug),
    composeInstalledSkillMd({
      slug,
      rawMd,
      fallbackDescription,
      todayIsoDate: today,
    }),
  );
}

/**
 * Install a single community skill by fetching its SKILL.md from GitHub.
 * `source` is the `owner/repo` from the search result, `skillId` the skill's
 * directory name on skills.sh. Returns the installed slug.
 */
export async function installCommunitySkill(
  fetchImpl: typeof fetch,
  vfs: Vfs,
  root: string,
  rawSource: string,
  skillId: string,
): Promise<string> {
  const source = normalizeSource(rawSource);
  if (!source)
    throw new SkillRemoteError("invalid_repo_source", rawSource.trim());

  // Try common path patterns first (cheap — no API call), then fall back to
  // scanning the repo tree and matching by directory name or frontmatter name.
  const candidates = [
    `skills/${skillId}/SKILL.md`,
    `${skillId}/SKILL.md`,
    "SKILL.md",
  ];
  let rawMd: string | null = null;
  for (const candidate of candidates) {
    rawMd = await fetchSkillMdAtPath(fetchImpl, source, candidate).catch(
      () => null,
    );
    if (rawMd !== null) break;
  }
  if (rawMd === null) {
    const path = await findSkillPathInRepo(fetchImpl, source, skillId).catch(
      () => null,
    );
    if (path)
      rawMd = await fetchSkillMdAtPath(fetchImpl, source, path).catch(
        () => null,
      );
  }
  if (rawMd === null)
    throw new SkillRemoteError(
      "skill_not_in_repo",
      `Could not find '${skillId}' in ${source}`,
    );

  // Prefer the SKILL.md's own `name:` (the authoritative slug); fall back to
  // a slugified id so a community id that isn't a clean slug still installs.
  const fmName = extractFrontmatterName(rawMd);
  const slug =
    fmName && isValidSkillSlug(fmName) ? fmName : slugifyInstallId(skillId);

  if (!(await healthyInstalled(vfs, root, slug))) {
    const parsed = parseRemoteSkillMd(rawMd, skillId);
    await writeInstall(vfs, root, slug, rawMd, parsed.description);
  }
  return slug;
}

/**
 * Install the user's selection out of what `listSkillsFromRepo` returned.
 * Fails fast on the first error so the user sees the real reason instead of
 * "installed 0 skills". Returns the installed slugs.
 */
export async function installSkillsFromRepo(
  fetchImpl: typeof fetch,
  vfs: Vfs,
  root: string,
  rawSource: string,
  skills: RepoSkill[],
): Promise<string[]> {
  const source = normalizeSource(rawSource);
  if (!source)
    throw new SkillRemoteError("invalid_repo_source", rawSource.trim());

  const installed: string[] = [];
  for (const skill of skills) {
    // The id becomes a vfs key segment — reject anything that isn't a clean
    // slug before touching storage (the UI only sends ids we listed, but the
    // route is reachable directly).
    if (!isValidSkillSlug(skill.id))
      throw new SkillRemoteError(
        "validation",
        `'${skill.id}' is not a valid skill name`,
      );
    if (await healthyInstalled(vfs, root, skill.id)) {
      installed.push(skill.id);
      continue;
    }
    const rawMd = await fetchSkillMdAtPath(fetchImpl, source, skill.path);
    const parsed = parseRemoteSkillMd(rawMd, skill.id);
    await writeInstall(vfs, root, skill.id, rawMd, parsed.description);
    installed.push(skill.id);
  }
  return installed;
}

/**
 * Locate a SKILL.md matching `skillId` via the Git Trees API. Two passes:
 * exact directory-name match first, then peek at frontmatter `name:` for
 * paths containing the id (capped at 10 fetches).
 */
async function findSkillPathInRepo(
  fetchImpl: typeof fetch,
  source: string,
  skillId: string,
): Promise<string | null> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${source}/git/trees/HEAD?recursive=1`,
    { headers: { "User-Agent": "houston-skills/1.0" } },
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
