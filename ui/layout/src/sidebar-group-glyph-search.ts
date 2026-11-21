import { SIDEBAR_GROUP_GLYPH_TAGS } from "./sidebar-group-glyph-tags.ts";
import type { SidebarGroupGlyphName } from "./sidebar-group-glyphs";

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

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
