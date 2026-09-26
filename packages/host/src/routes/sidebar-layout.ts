import {
  DEFAULT_SIDEBAR_LAYOUT,
  normalizeSidebarLayout,
  type SidebarLayout,
} from "@houston/protocol";

export { DEFAULT_SIDEBAR_LAYOUT, parseSidebarLayout } from "@houston/protocol";

/**
 * Read the stored `sidebar_layout` pref. A hand-edited or corrupt doc keeps
 * every group it still names rather than reading as empty, because the next
 * whole-document write would otherwise store that emptiness over it.
 */
export function readSidebarLayout(raw: string | null): SidebarLayout {
  if (!raw) return DEFAULT_SIDEBAR_LAYOUT;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Unparseable JSON names no groups to keep.
    return DEFAULT_SIDEBAR_LAYOUT;
  }
  return normalizeSidebarLayout(parsed);
}
