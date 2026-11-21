export function connectOriginKey(
  surface: string,
  section: string,
  slug: string,
): string {
  return `${surface}:${section}:${slug}`;
}

export interface RenderedSection {
  section: string;
  slugs: readonly string[];
}

export function inlineOwners(
  rendered: readonly RenderedSection[],
  surface: string,
  origins: Record<string, string>,
): Map<string, string> {
  const fallback = new Map<string, string>();
  const owners = new Map<string, string>();
  for (const { section, slugs } of rendered) {
    for (const slug of slugs) {
      const key = connectOriginKey(surface, section, slug);
      if (!fallback.has(slug)) fallback.set(slug, key);
      if (origins[slug] === key) owners.set(slug, key);
    }
  }
  for (const [slug, key] of fallback) {
    if (!owners.has(slug)) owners.set(slug, key);
  }
  return owners;
}
