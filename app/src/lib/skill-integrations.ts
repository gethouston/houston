/**
 * The connected apps a skill declares in its SKILL.md frontmatter
 * (`integrations: [gmail, slack]`), normalized once for every surface that
 * renders them: the picker / chat-empty-state cards, the installed-skills strip
 * rows, the skill edit modal, and the in-chat skill invocation card.
 *
 * That frontmatter is hand-authored YAML, so the raw list arrives with author
 * casing ("Gmail"), stray padding, blanks, and duplicates. The Composio toolkit
 * catalog is keyed by lowercase slug, so an un-normalized "Gmail" silently
 * misses the catalog and degrades to the favicon guess. Normalizing here keeps
 * every surface resolving the same logo for the same app.
 *
 * Author order is preserved: it is the intended reading order on the card.
 */
export function skillIntegrationSlugs(
  integrations: readonly string[] | null | undefined,
): string[] {
  if (!integrations) return [];
  const seen = new Set<string>();
  const slugs: string[] = [];
  for (const raw of integrations) {
    // Frontmatter is untrusted YAML: `integrations: [1]` parses to a number.
    if (typeof raw !== "string") continue;
    const slug = raw.trim().toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    slugs.push(slug);
  }
  return slugs;
}
