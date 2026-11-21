export interface SkillFolderPath {
  slug: string;
  isSkillFile: boolean;
}

const SKILL_ROOTS = [".agents/skills/", ".claude/skills/"];

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
