import type { SidebarGroupGlyphName } from "./sidebar-group-glyphs";

export interface SidebarGroupGlyphChoice {
  name: SidebarGroupGlyphName;
  label: string;
}

export interface SidebarGroupSwatch {
  id: string;
  value: string;
  label: string;
}

export interface SidebarGroupIdentityLabels {
  trigger: string;
  icons: string;
  colors: string;
  search: string;
  emptySearch: string;
}
