import type { RepoSkill } from "@houston/protocol";
import {
  extractFrontmatterName,
  isValidSkillSlug,
  kebabToTitle,
  normalizeSource,
  parseRemoteSkillMd,
  skillIdFromPath,
  slugifyInstallId,
} from "./github-parse";
import { SkillRemoteError } from "./remote-error";

/**
 * GitHub-side skill discovery over the network: list every SKILL.md in a repo
 * (Git Trees API) and fetch a SKILL.md's raw content. Pure parsing lives in
 * ./github-parse.ts; install composition in ./install.ts.
 */

const GH_HEADERS = { "User-Agent": "houston-skills/1.0" };

/**
 * Fetch a SKILL.md's raw content from the repo's default branch. A single
 * request to the `HEAD` ref on raw.githubusercontent.com resolves whatever the
 * default branch is (main, master, or anything else), so this covers every
 * repo in one round-trip. The previous concurrent `main`+`master` double-probe
 * both cost an extra request on every call AND silently 404'd on repos whose
 * default branch was neither (a latent bug). raw.githubusercontent.com is
 * CDN-served and effectively not rate-limited, unlike api.github.com.
 */
export async function fetchSkillMdAtPath(
  fetchImpl: typeof fetch,
  source: string,
  path: string,
): Promise<string> {
  const res = await fetchImpl(
    `https://raw.githubusercontent.com/${source}/HEAD/${path}`,
    { headers: GH_HEADERS },
  );
  if (!res.ok)
    throw new SkillRemoteError(
      "offline",
      `Could not fetch '${path}' from ${source}`,
    );
  return res.text();
}

/**
 * Discover all SKILL.md files in a GitHub repo via the Git Trees API.
 * Accepts `owner/repo` or anything `normalizeSource` recovers.
 */
export async function listSkillsFromRepo(
  fetchImpl: typeof fetch,
  rawSource: string,
): Promise<{ source: string; skills: RepoSkill[] }> {
  const source = normalizeSource(rawSource);
  if (!source)
    throw new SkillRemoteError("invalid_repo_source", rawSource.trim());

  let repoRes: Response;
  try {
    repoRes = await fetchImpl(`https://api.github.com/repos/${source}`, {
      headers: GH_HEADERS,
    });
  } catch (err) {
    throw new SkillRemoteError(
      "offline",
      `Network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (repoRes.status === 401 || repoRes.status === 403)
    throw new SkillRemoteError("repo_private", `Repo '${source}' is private`);
  if (repoRes.status === 404)
    throw new SkillRemoteError(
      "repo_not_found",
      `Couldn't find a repo named '${source}'`,
    );
  if (repoRes.status === 429)
    throw new SkillRemoteError(
      "github_rate_limited",
      "GitHub rate limit hit, wait a moment and try again",
    );
  if (!repoRes.ok)
    throw new SkillRemoteError(
      "offline",
      `GitHub returned ${repoRes.status} for repo '${source}'`,
    );

  let treeRes: Response;
  try {
    treeRes = await fetchImpl(
      `https://api.github.com/repos/${source}/git/trees/HEAD?recursive=1`,
      { headers: GH_HEADERS },
    );
  } catch (err) {
    throw new SkillRemoteError(
      "offline",
      `Network error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!treeRes.ok)
    throw new SkillRemoteError(
      "offline",
      `Could not read repo contents (${treeRes.status})`,
    );
  const tree = (await treeRes.json().catch(() => null)) as {
    tree?: Array<{ path: string; type: string }>;
    truncated?: boolean;
  } | null;
  if (!tree || !Array.isArray(tree.tree))
    throw new SkillRemoteError("offline", "Failed to parse repo tree");
  if (tree.truncated)
    console.warn(
      `[host-skills] repo tree for ${source} was truncated — some skills may be missing`,
    );

  const skillPaths = tree.tree
    .filter((e) => e.type === "blob" && e.path.endsWith("SKILL.md"))
    .map((e) => e.path);
  if (skillPaths.length === 0)
    throw new SkillRemoteError(
      "repo_no_skills",
      `No skills found in '${source}'`,
    );

  // Fetch content so the frontmatter `name:` can override a path-derived id —
  // repos named `My_Repo` can't be install ids, but authors declare a slug.
  const repoName = source.split("/").at(-1) ?? source;
  const skills: RepoSkill[] = [];
  for (const path of skillPaths) {
    const derivedId = skillIdFromPath(path, repoName);
    try {
      const raw = await fetchSkillMdAtPath(fetchImpl, source, path);
      const parsed = parseRemoteSkillMd(raw, derivedId);
      const fmName = extractFrontmatterName(raw);
      const id =
        fmName && isValidSkillSlug(fmName)
          ? fmName
          : slugifyInstallId(derivedId);
      skills.push({
        id,
        name: parsed.name,
        description: parsed.description,
        path,
      });
    } catch {
      skills.push({
        id: slugifyInstallId(derivedId),
        name: kebabToTitle(derivedId),
        description: "",
        path,
      });
    }
  }
  return { source, skills };
}
