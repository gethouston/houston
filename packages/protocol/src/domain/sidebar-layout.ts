export interface SidebarGroup {
  id: string;
  name: string;
  collapsed: boolean;
  agentIds: string[];
  icon?: string;
  color?: string;
}

export type SidebarRootEntry =
  | { kind: "group"; id: string }
  | { kind: "agent"; id: string };

export interface SidebarLayout {
  groups: SidebarGroup[];
  order: SidebarRootEntry[];
}

export const SIDEBAR_GROUP_NAME_MAX_CODE_POINTS = 60;
export const SIDEBAR_GROUPS_MAX = 200;
export const SIDEBAR_AGENT_IDS_MAX = 2000;
export const SIDEBAR_ID_MAX_BYTES = 128;
export const SIDEBAR_ICON_MAX_BYTES = 64;
export const SIDEBAR_COLOR_MAX_BYTES = 64;

export const DEFAULT_SIDEBAR_LAYOUT: SidebarLayout = { groups: [], order: [] };

const encoder = new TextEncoder();
const utf8Length = (value: string) => encoder.encode(value).length;

export function sidebarGroupNameTooLong(name: string): boolean {
  return Array.from(name).length > SIDEBAR_GROUP_NAME_MAX_CODE_POINTS;
}

export function clampSidebarGroupName(name: string): string {
  return Array.from(name).slice(0, SIDEBAR_GROUP_NAME_MAX_CODE_POINTS).join("");
}

export function isSidebarId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    utf8Length(value) <= SIDEBAR_ID_MAX_BYTES
  );
}

export function isSidebarStyle(
  value: unknown,
  maxBytes: typeof SIDEBAR_ICON_MAX_BYTES | typeof SIDEBAR_COLOR_MAX_BYTES,
): value is string {
  return typeof value === "string" && utf8Length(value) <= maxBytes;
}

export const isSidebarRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
