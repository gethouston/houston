export function humanizeSkillName(slug: string): string {
  // Tolerate a missing/empty identity: a display helper must never crash the
  // whole view. Callers pass engine-supplied names that should always be set,
  // but we degrade gracefully rather than throw on `undefined`.
  if (!slug) return "";
  const spaced = slug.replace(/[-_]+/g, " ").trim();
  if (spaced.length === 0) return slug;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
