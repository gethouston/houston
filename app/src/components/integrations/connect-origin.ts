/**
 * Row identity for the connect flow's inline state.
 *
 * The browse catalog deliberately renders some apps TWICE — the curated "Most
 * used" spotlight repeats rows that also live in their own category section —
 * so "expand the row whose slug is connecting" expands two rows and duplicates
 * both the panel and its live region. Exactly ONE row may own that expansion,
 * and it must be the row the user actually pressed. These helpers are the
 * tiebreak: `connectOriginKey` names a row, `connect(slug, origin)` records the
 * name, and `inlineOwners` reads it back at render time.
 *
 * Pure and DOM-free so the rule is node-testable (`app/tests/connect-origin.test.ts`).
 */

/** One catalog row's stable identity: its surface, its section, its app. */
export function connectOriginKey(
  surface: string,
  section: string,
  slug: string,
): string {
  return `${surface}:${section}:${slug}`;
}

/** The rows one section currently renders, in display order. */
export interface RenderedSection {
  section: string;
  slugs: readonly string[];
}

/**
 * slug -> the {@link connectOriginKey} of the ONE rendered row that shows that
 * app's inline connect state.
 *
 * The row the flow was started from wins. When it is no longer rendered — the
 * user searched, filtered, or collapsed the section mid-hand-off, and the
 * spotlight row that started the flow dropped out — the first rendered copy
 * takes over rather than letting a live OAuth (and its Cancel) vanish from the
 * page. Apps with no live flow still get an owner, so the settled outcome has
 * somewhere to land the moment one starts.
 */
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
