import { SIDEBAR_GROUP_GLYPH_TAGS } from "./sidebar-group-glyph-tags";
import type { SidebarGroupGlyphName } from "./sidebar-group-glyphs";

/**
 * Lowercased and stripped of diacritics, so "dolar" finds "dólar" and "acao"
 * finds "ação". Typing an accent is work on most keyboards, and a search that
 * demands it hides half the vocabulary from the languages that use them.
 */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

/**
 * Case- and accent-insensitive substring matching across the glyph's key words,
 * its curated concepts, and whatever else the caller offers as `extraHaystack`.
 *
 * The key words and concepts are ENGLISH, which is all this package can know:
 * it holds no translations. The caller passes the localized name of the mark in
 * `extraHaystack`, which is what makes a Spanish reader's "dinero" find the
 * money marks instead of an empty grid.
 */
export function matchesSidebarGroupGlyph(
  name: SidebarGroupGlyphName,
  query: string,
  ...extraHaystack: string[]
): boolean {
  const needle = fold(query.trim());
  if (!needle) return true;
  return [
    ...name.split("-"),
    ...SIDEBAR_GROUP_GLYPH_TAGS[name],
    ...extraHaystack,
  ].some((term) => fold(term).includes(needle));
}
