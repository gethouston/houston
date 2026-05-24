export function normalizeToolkitSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

export function normalizeToolkitSlugs(slugs: string[]): string[] {
  return Array.from(
    new Set(slugs.map(normalizeToolkitSlug).filter((slug) => slug.length > 0)),
  ).sort();
}
