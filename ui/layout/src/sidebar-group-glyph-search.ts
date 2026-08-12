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

/**
 * Name words that are concepts in their own right, which no curated tag says.
 *
 * A mark's NAME sometimes carries a word its LABEL does not: `search` is
 * labelled "Magnifier", `music-tape` is "Cassette tape", `present` is "Gift".
 * The matcher reads names in English always, so those words are free handles
 * for an English reader, and a Spanish or Portuguese one has nothing to type:
 * a localized label can only carry what the English label already said.
 * Listing the word here gives the consumer a key to translate, which is what
 * makes "buscar" find the magnifier.
 *
 * They live here rather than in the generator's tag rules because a rule
 * assigns its words to every mark its PATTERN matches: `ball` on the sports
 * rule would tag the joystick and the dice, and the rules' order also decides
 * which shelf a mark lands on. This set names marks one word at a time and
 * moves nothing.
 *
 * A word the mark's own English label already says stays OUT: the localized
 * labels translate that same label, so the concept is reachable already.
 */
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

/**
 * Every English word a consumer is asked to translate: the curated tags plus
 * the name words that carry a concept of their own.
 *
 * Exported because it is the CLOSED set {@link sidebarGroupGlyphConcepts} draws
 * from, and both this package's tests and the app's locale check pin it. A
 * concept outside it would search as an untranslated English word in a Spanish
 * picker.
 */
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
