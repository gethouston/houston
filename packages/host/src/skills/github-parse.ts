/**
 * Pure parsing halves of GitHub skill discovery: source normalization, slug
 * derivation, and lightweight remote-SKILL.md metadata extraction. Network
 * calls live in ./github.ts.
 */

/**
 * Extract a GitHub `owner/repo` from arbitrary user-supplied input: the short
 * form, full URLs (`.git`, `/tree/main`, `?query`, `#frag` tolerated), the SSH
 * form (`git@github.com:owner/repo`), or a whole pasted shell command — by
 * anchoring on the `github.com` host wherever it appears. Returns null when no
 * owner/repo shape can be recovered, so callers surface a typed
 * `invalid_repo_source` instead of firing a doomed GitHub lookup. (HOU-440)
 */
export function normalizeSource(source: string): string | null {
  const trimmed = source.trim().replace(/^["'`]+|["'`]+$/g, "");

  let afterHost = trimmed;
  for (const marker of ["github.com/", "github.com:"]) {
    const idx = trimmed.indexOf(marker);
    if (idx !== -1) {
      afterHost = trimmed.slice(idx + marker.length);
      break;
    }
  }

  // A pasted command carries trailing args; a URL may carry a query or
  // fragment. Keep the first whitespace token, truncated at any `?`/`#`.
  const candidate = (afterHost.split(/\s+/)[0] ?? "").split(/[?#]/)[0] ?? "";

  const segments = candidate.split("/").filter(Boolean);
  const owner = segments[0];
  const repo = segments[1]?.replace(/\.git$/, "");
  if (!owner || !repo) return null;

  // GitHub's allowed charsets: owner `[A-Za-z0-9-]`, repo `[A-Za-z0-9._-]`.
  if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo))
    return null;
  return `${owner}/${repo}`;
}

/** A valid install slug per the skills schema: lowercase kebab, ≤64 chars. */
export function isValidSkillSlug(s: string): boolean {
  return s.length > 0 && s.length <= 64 && /^[a-z0-9-]+$/.test(s);
}

/** Coerce an arbitrary string into a valid install slug (never empty). */
export function slugifyInstallId(s: string): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  return slug || "skill";
}

/** `research/SKILL.md` → `research`; a root `SKILL.md` → the repo name. */
export function skillIdFromPath(path: string, repoName: string): string {
  if (!path.endsWith("/SKILL.md")) return repoName;
  const dir = path.slice(0, -"/SKILL.md".length);
  return dir.split("/").at(-1) ?? repoName;
}

/** Extract the `name:` field from YAML frontmatter, if any. */
export function extractFrontmatterName(content: string): string | null {
  let inFrontmatter = false;
  for (const line of content.split("\n")) {
    if (line.trim() === "---") {
      if (inFrontmatter) return null;
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter && line.startsWith("name:")) {
      return line
        .slice("name:".length)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

/** Lightweight title + description pulled from a remote SKILL.md for listing. */
export function parseRemoteSkillMd(
  content: string,
  fallbackId: string,
): { name: string; description: string } {
  let description = "";
  const bodyLines: string[] = [];
  let inFrontmatter = false;
  let frontmatterDone = false;

  for (const line of content.split("\n")) {
    if (line.trim() === "---" && !frontmatterDone) {
      if (inFrontmatter) frontmatterDone = true;
      else inFrontmatter = true;
      continue;
    }
    if (inFrontmatter && !frontmatterDone) {
      if (line.startsWith("description:"))
        description = line
          .slice("description:".length)
          .trim()
          .replace(/^"|"$/g, "");
    } else if (frontmatterDone) {
      bodyLines.push(line);
    }
  }
  const body = frontmatterDone ? bodyLines : content.split("\n");

  let name = "";
  for (const line of body) {
    if (line.startsWith("# ")) {
      name = line.slice(2).trim();
      break;
    }
  }
  if (!name) name = kebabToTitle(fallbackId);

  if (description.length > 200) {
    const cut = description.slice(0, 200);
    const pos = cut.lastIndexOf(". ");
    description = pos !== -1 ? description.slice(0, pos + 1) : cut;
  }
  return { name, description };
}

export function kebabToTitle(s: string): string {
  return s
    .split("-")
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}
