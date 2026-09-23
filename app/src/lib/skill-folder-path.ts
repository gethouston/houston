/**
 * Where a skill lives on disk, read back out of a path.
 *
 * A skill is a FOLDER — `.agents/skills/<slug>/` (or `.claude/skills/<slug>/`
 * for skills authored against the Claude layout) — whose `SKILL.md` IS the
 * skill; everything else under it (reference docs, scripts) is material the
 * skill carries. Surfaces that only see a path (the turn-end summary rail)
 * need that distinction to name the skill the agent just saved instead of
 * reporting "something under .agents changed".
 *
 * Pure and separator-tolerant: callers pass a workspace-relative path in
 * either separator (see agent-file-paths.ts).
 */

export interface SkillFolderPath {
  /** The folder name, in its authored casing — the skill's slug. */
  slug: string;
  /** True only for the folder's own `SKILL.md`, never for a file beside it. */
  isSkillFile: boolean;
}

const SKILL_ROOTS = [".agents/skills/", ".claude/skills/"];

/** Index just past the `<root>/skills/` prefix, or null when there is none. */
function skillsRootEnd(lowerRelative: string): number | null {
  for (const root of SKILL_ROOTS) {
    if (lowerRelative.startsWith(root)) return root.length;
    const at = lowerRelative.indexOf(`/${root}`);
    if (at !== -1) return at + root.length + 1;
  }
  return null;
}

export function skillFolderPathOf(relative: string): SkillFolderPath | null {
  const posix = relative.replace(/\\/g, "/");
  const end = skillsRootEnd(posix.toLowerCase());
  if (end === null) return null;
  const [slug, ...deeper] = posix.slice(end).split("/");
  if (!slug) return null;
  return {
    slug,
    isSkillFile: deeper.length === 1 && deeper[0].toLowerCase() === "skill.md",
  };
}
