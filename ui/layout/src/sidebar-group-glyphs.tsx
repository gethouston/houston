/**
 * The group mark set: 251 SOLID silhouettes, from Ionicons (Sharp weight),
 * curated for the teams people actually make (sales, HR, marketing, ops,
 * finance, support — knowledge work first, dev iconography a minority).
 *
 * SOLID and not stroked, because a group's mark sits at 14px beside a 13px
 * label. At that size a 2px outline is mostly hole: the shape reads as a grey
 * smudge and two different marks become indistinguishable at a glance. A filled
 * silhouette keeps its identity down to the last pixel, which is the whole
 * point of letting someone pick one.
 *
 * DRAWN BY A TYPE FOUNDRY, not by us. Hand-authored silhouettes are exactly
 * what a rail cannot carry: beside Linear's the shapes read lumpy, because a
 * mark this small is all optical correction and there is no way to eyeball it.
 * Lucide — the rail's icon set and the repo's only other sanctioned one — is
 * stroke-based by construction and ships no fill weight, so the set comes from
 * Ionicons' Sharp weight instead. That is a second icon vocabulary in the
 * product, and it is deliberate: it appears ONLY inside a group's picked mark,
 * never as chrome the product draws for itself, and the alternative was a set
 * that looks home-made in the one column a user personalises.
 *
 * SHARP and not ionicons' rounded weight, because the marks sit in a rail of
 * square-shouldered chrome, and because a squared silhouette holds its corners
 * at 14px where a rounded one softens into a lozenge.
 *
 * The paths are Ionicons' OWN, copied verbatim on ionicons' own 512-unit box —
 * see `sidebar-group-glyph-paths.ts`, which holds the table and the licence.
 * Not rescaled to Lucide's 24: the viewBox is an internal coordinate system
 * nobody outside this file can see (the row sizes the mark with a class), and
 * dividing every coordinate by hand is precisely the kind of manual transform
 * that produces lumpy silhouettes.
 *
 * Every mark is filled with `currentColor` and NOTHING else — invariant 3 of
 * `sidebar-geometry.ts` (a row's glyph never pins a colour) holds for a picked
 * mark exactly as it does for a Lucide one. The tint a group wears is inherited
 * from the row, never baked into the path.
 *
 * KEYS ARE STORED DATA. A group's chosen mark is persisted by NAME (the stored
 * `icon` string, local layout or C13 wire alike), so a key here may be
 * retired but never renamed or repurposed: renaming one silently swaps the mark
 * under every group that picked it. Every key of every earlier set is still
 * here — the 56 that predate the 251 expansion included, a handful on legacy
 * names older than the ionicons-name rule.
 */
import type { ReactElement } from "react";
import { SIDEBAR_GROUP_GLYPHS } from "./sidebar-group-glyph-paths";

export { SIDEBAR_GROUP_GLYPHS } from "./sidebar-group-glyph-paths";

/** One of the 251 marks a group may wear. */
export type SidebarGroupGlyphName = keyof typeof SIDEBAR_GROUP_GLYPHS;

/**
 * The set in display order — the order the pickers' grids lay them out, so a
 * grid never has to restate it and two pickers cannot disagree about it. The
 * table is ordered in themed runs (people, communication, commerce, planning,
 * office, creative, tech, health and food, nature, travel and leisure — the
 * module split of `sidebar-group-glyph-paths.ts`), so a grid of ANY width
 * reads as neighbourhoods rather than as an alphabet; column count is each
 * picker's own (the rail submenu draws 8, the identity popover 14).
 */
export const SIDEBAR_GROUP_GLYPH_NAMES: readonly SidebarGroupGlyphName[] =
  Object.keys(SIDEBAR_GROUP_GLYPHS) as SidebarGroupGlyphName[];

/**
 * Whether a stored string still names a mark in this set. Stored identities
 * outlive the set that produced them: a name retired between releases has to
 * resolve to "no mark", never to a blank box or a thrown render.
 */
export function isSidebarGroupGlyph(
  name: string | undefined,
): name is SidebarGroupGlyphName {
  return name !== undefined && Object.hasOwn(SIDEBAR_GROUP_GLYPHS, name);
}

/**
 * One mark, filled with the row's own ink.
 *
 * An unknown name renders NOTHING rather than a placeholder, because only the
 * host knows what a group with no usable mark should show — the rail's default
 * team glyph, an avatar, or an empty column. A placeholder decided here would
 * be a second fallback competing with the host's.
 */
export function SidebarGroupGlyph({
  name,
  className,
}: {
  name: string;
  className?: string;
}): ReactElement | null {
  if (!isSidebarGroupGlyph(name)) return null;
  return (
    <svg
      viewBox="0 0 512 512"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={SIDEBAR_GROUP_GLYPHS[name]} />
    </svg>
  );
}
