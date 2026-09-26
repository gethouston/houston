/** A personal sidebar folder containing agents in drag order. */
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

/** A person's sidebar folders and their shared top-level order. */
export interface SidebarLayout {
  groups: SidebarGroup[];
  order: SidebarRootEntry[];
}

/**
 * The stored-layout limits the host and the gateway both enforce. Names count
 * code points (the gateway counts runes); ids, icons and colors count UTF-8
 * bytes (the gateway's `len`).
 */
export const SIDEBAR_GROUP_NAME_MAX_CODE_POINTS = 60;
export const SIDEBAR_GROUPS_MAX = 200;
/** Across group members and top-level agent rows together. */
export const SIDEBAR_AGENT_IDS_MAX = 2000;
export const SIDEBAR_ID_MAX_BYTES = 128;
export const SIDEBAR_ICON_MAX_BYTES = 64;
export const SIDEBAR_COLOR_MAX_BYTES = 64;

/** The layout an unset or unreadable `sidebar_layout` reads as. */
export const DEFAULT_SIDEBAR_LAYOUT: SidebarLayout = { groups: [], order: [] };

const encoder = new TextEncoder();
const utf8Length = (value: string) => encoder.encode(value).length;

/** Whether a group name exceeds what a stored layout accepts. */
export function sidebarGroupNameTooLong(name: string): boolean {
  return Array.from(name).length > SIDEBAR_GROUP_NAME_MAX_CODE_POINTS;
}

/** The longest prefix of `name` a stored layout accepts. */
export function clampSidebarGroupName(name: string): string {
  return Array.from(name).slice(0, SIDEBAR_GROUP_NAME_MAX_CODE_POINTS).join("");
}

/** A non-empty group, agent or order id within the stored byte limit. */
export function isSidebarId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    utf8Length(value) <= SIDEBAR_ID_MAX_BYTES
  );
}

/** An icon or color string within its stored byte limit. */
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
