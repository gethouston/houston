import type { ReactElement } from "react";
import {
  resolveSidebarGroupGlyph,
  SIDEBAR_GROUP_GLYPHS,
  type SidebarGroupGlyphName,
} from "./sidebar-group-glyph-data";

export type { SidebarGroupGlyphName } from "./sidebar-group-glyph-data";
export {
  LEGACY_SIDEBAR_GROUP_GLYPH_ALIASES,
  resolveSidebarGroupGlyph,
  SIDEBAR_GROUP_GLYPHS,
} from "./sidebar-group-glyph-data";

export const SIDEBAR_GROUP_GLYPH_NAMES: readonly SidebarGroupGlyphName[] =
  Object.keys(SIDEBAR_GROUP_GLYPHS) as SidebarGroupGlyphName[];

export function isSidebarGroupGlyph(name: string | undefined): boolean {
  return resolveSidebarGroupGlyph(name) !== undefined;
}

export function SidebarGroupGlyph({
  name,
  className,
}: {
  name: string;
  className?: string;
}): ReactElement | null {
  const resolvedName = resolveSidebarGroupGlyph(name);
  if (!resolvedName) return null;
  const glyph = SIDEBAR_GROUP_GLYPHS[resolvedName];
  return (
    <svg
      viewBox={glyph.viewBox}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: build-generated markup from the checked-in, trusted SVG asset; generator strips fill and accepts symbol bodies only
      dangerouslySetInnerHTML={{ __html: glyph.body }}
    />
  );
}
