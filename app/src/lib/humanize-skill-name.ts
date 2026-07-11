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
