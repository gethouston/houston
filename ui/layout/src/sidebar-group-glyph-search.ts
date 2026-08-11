import { SIDEBAR_GROUP_GLYPH_TAGS } from "./sidebar-group-glyph-tags";
import type { SidebarGroupGlyphName } from "./sidebar-group-glyphs";

/** Case-insensitive substring matching across key words and curated concepts. */
export function matchesSidebarGroupGlyph(
  name: SidebarGroupGlyphName,
  query: string,
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [...name.split("-"), ...SIDEBAR_GROUP_GLYPH_TAGS[name]].some((term) =>
    term.includes(needle),
  );
}
