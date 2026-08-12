/**
 * Team marks from Julian's 16px solid set. The generated data keeps each
 * symbol's native multi-element SVG body and strips pinned fills so every mark
 * inherits `currentColor` from the surface that renders it.
 *
 * Keys are persisted identity data. Direct new-set keys and documented legacy
 * aliases resolve; an unknown key renders nothing so the app can show its
 * neutral team mark.
 */
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

/** The generated source order, used as the picker's stable display order. */
export const SIDEBAR_GROUP_GLYPH_NAMES: readonly SidebarGroupGlyphName[] =
  Object.keys(SIDEBAR_GROUP_GLYPHS) as SidebarGroupGlyphName[];

/** Whether a stored key resolves directly or through a legacy alias. */
export function isSidebarGroupGlyph(name: string | undefined): boolean {
  return resolveSidebarGroupGlyph(name) !== undefined;
}

/** One mark, filled with the surrounding surface's ink. */
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
