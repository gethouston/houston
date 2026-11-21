export function humanizeSkillName(slug: string): string {
  if (!slug) return "";
  const spaced = slug.replace(/[-_]+/g, " ").trim();
  if (spaced.length === 0) return slug;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function skillDisplayTitle(skill: {
  name: string;
  title?: string | null;
}): string {
  return skill.title?.trim() || humanizeSkillName(skill.name);
}

export function skillTitleOfSlug(
  slug: string,
  skills: readonly { name: string; title?: string | null }[] | undefined,
): string {
  const skill = skills?.find((candidate) => candidate.name === slug);
  return skill ? skillDisplayTitle(skill) : humanizeSkillName(slug);
}
