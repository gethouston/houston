import { SIDEBAR_GROUP_GLYPH_TAGS } from "./sidebar-group-glyph-tags.ts";
import type { SidebarGroupGlyphName } from "./sidebar-group-glyphs";

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

const NAME_WORD_CONCEPTS: readonly string[] = [
  "air",
  "ball",
  "flat",
  "hear",
  "key",
  "line",
  "moving",
  "music",
  "notified",
  "present",
  "recycle",
  "routing",
  "search",
  "small",
  "smile",
  "staircase",
  "starred",
  "tee",
];

export const SIDEBAR_GROUP_GLYPH_CONCEPT_VOCABULARY: ReadonlySet<string> =
  new Set([
    ...Object.values(SIDEBAR_GROUP_GLYPH_TAGS).flat(),
    ...NAME_WORD_CONCEPTS,
  ]);

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
 * Name words the vocabulary does not know ("stack", "airplane") are left out:
 * each is a word the mark's own English label already says, so the localized
 * labels carry its translation and a key here would ask for the same word
 * twice.
 */
export function sidebarGroupGlyphConcepts(
  name: SidebarGroupGlyphName,
): string[] {
  return [
    ...new Set([
      ...SIDEBAR_GROUP_GLYPH_TAGS[name],
      ...name
        .split("-")
        .filter((word) => SIDEBAR_GROUP_GLYPH_CONCEPT_VOCABULARY.has(word)),
    ]),
  ];
}
