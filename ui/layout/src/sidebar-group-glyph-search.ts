// Explicit extension, as in `ui/chat`: it lets node's own ESM loader import
// this module, which is what the app's node:test check of the localized concept
// vocabulary against the real matcher needs.
import { SIDEBAR_GROUP_GLYPH_TAGS } from "./sidebar-group-glyph-tags.ts";
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
 * it holds no translations. The caller passes the localized name of the mark
 * AND its localized concepts (`sidebarGroupGlyphConcepts`, translated) in
 * `extraHaystack`. That is what makes a Spanish reader's "dinero" find the
 * money marks instead of an empty grid, while the English words kept here mean
 * "money" still finds them too.
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

/** Every word the curated tags use, across the whole mark set. */
const TAG_VOCABULARY: ReadonlySet<string> = new Set(
  Object.values(SIDEBAR_GROUP_GLYPH_TAGS).flat(),
);

/**
 * The English words that DESCRIBE a mark, for a consumer that means to
 * translate them: the curated tags, plus the words of the mark's own name that
 * the vocabulary knows.
 *
 * The name words matter because the generator leaves a word out of a mark's
 * tags when the name already carries it: `money-stack` is tagged finance and
 * banking but NOT money. The matcher reads that name in English and needs no
 * help, but a Spanish reader typing "dinero" would miss the mark the whole set
 * is named after unless the concept it is named for is translated too.
 *
 * Name words the vocabulary does not know ("stack") are left out: the consumer
 * translates from a fixed vocabulary, and inventing keys for the leftovers of
 * 233 slugs would ask for translations of words no one curated as a concept.
 */
export function sidebarGroupGlyphConcepts(
  name: SidebarGroupGlyphName,
): string[] {
  return [
    ...new Set([
      ...SIDEBAR_GROUP_GLYPH_TAGS[name],
      ...name.split("-").filter((word) => TAG_VOCABULARY.has(word)),
    ]),
  ];
}
