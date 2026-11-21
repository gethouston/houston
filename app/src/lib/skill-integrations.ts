export function skillIntegrationSlugs(
  integrations: readonly string[] | null | undefined,
): string[] {
  if (!integrations) return [];
  const seen = new Set<string>();
  const slugs: string[] = [];
  for (const raw of integrations) {
    if (typeof raw !== "string") continue;
    const slug = raw.trim().toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
  }
  return slugs;
}
