export function humanizeSkillName(slug: string): string {
  // Tolerate a missing/empty identity: a display helper must never crash the
  // whole view. Callers pass engine-supplied names that should always be set,
  // but we degrade gracefully rather than throw on `undefined`.
  if (!slug) return "";
  const spaced = slug.replace(/[-_]+/g, " ").trim();
  if (spaced.length === 0) return slug;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The title a skill renders with everywhere (cards, chip, chat marker,
 * mission title): the frontmatter `title:` when the file carries one
 * (translated store skills do — it holds the accents/casing the ASCII
 * directory slug can't), else the humanized slug.
 */
export function skillDisplayTitle(skill: {
  name: string;
  title?: string | null;
}): string {
  return skill.title?.trim() || humanizeSkillName(skill.name);
}

/**
 * The title for a skill a surface knows only by its directory slug (the
 * turn-end summary names the skill a turn saved that way). Resolved against the
 * agent's loaded skills so the row reads like every other skill surface;
 * the humanized slug stands in while that list is still being read, rather
 * than holding the row back.
 */
export function skillTitleOfSlug(
  slug: string,
  skills: readonly { name: string; title?: string | null }[] | undefined,
): string {
  const skill = skills?.find((candidate) => candidate.name === slug);
  return skill ? skillDisplayTitle(skill) : humanizeSkillName(slug);
}
