import {
  DEFAULT_SIDEBAR_LAYOUT,
  normalizeSidebarLayout,
  type SidebarLayout,
} from "@houston/protocol";

export { DEFAULT_SIDEBAR_LAYOUT, parseSidebarLayout } from "@houston/protocol";

export function readSidebarLayout(raw: string | null): SidebarLayout {
  if (!raw) return DEFAULT_SIDEBAR_LAYOUT;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_SIDEBAR_LAYOUT;
  }
  return normalizeSidebarLayout(parsed);
}
