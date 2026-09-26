import {
  clampSidebarGroupName,
  DEFAULT_SIDEBAR_LAYOUT,
  isSidebarId,
  isSidebarRecord,
  isSidebarStyle,
  SIDEBAR_AGENT_IDS_MAX,
  SIDEBAR_COLOR_MAX_BYTES,
  SIDEBAR_GROUPS_MAX,
  SIDEBAR_ICON_MAX_BYTES,
  type SidebarGroup,
  type SidebarLayout,
  type SidebarRootEntry,
} from "./sidebar-layout";

/** Legacy documents carry `ungroupedOrder` instead of `order`: groups first. */
function rawOrder(raw: Record<string, unknown>, groups: SidebarGroup[]) {
  if (Array.isArray(raw.order)) return raw.order;
  if (!Array.isArray(raw.ungroupedOrder)) return [];
  return [
    ...groups.map((group) => ({ kind: "group", id: group.id })),
    ...raw.ungroupedOrder.map((id: unknown) => ({ kind: "agent", id })),
  ];
}

/**
 * Coerce an untrusted value (a cache read, a server payload, a device copy, a
 * legacy or hand-edited stored document) into a layout `parseSidebarLayout`
 * accepts. Anything that still identifies a group keeps it: a duplicate group
 * id keeps the first, an agent in two places stays in the first, an overlong
 * name is clamped, and malformed entries and fields are dropped. A value with
 * no `groups`/`order` shape at all reads as the empty layout.
 */
export function normalizeSidebarLayout(raw: unknown): SidebarLayout {
  if (!isSidebarRecord(raw)) return DEFAULT_SIDEBAR_LAYOUT;
  const groups: SidebarGroup[] = [];
  const groupIds = new Set<string>();
  const agentIds = new Set<string>();
  const claimAgent = (id: unknown): id is string => {
    if (!isSidebarId(id) || agentIds.has(id)) return false;
    if (agentIds.size >= SIDEBAR_AGENT_IDS_MAX) return false;
    agentIds.add(id);
    return true;
  };
  for (const value of Array.isArray(raw.groups) ? raw.groups : []) {
    if (groups.length >= SIDEBAR_GROUPS_MAX) break;
    if (!isSidebarRecord(value)) continue;
    const { id, name, collapsed, agentIds: members, icon, color } = value;
    if (!isSidebarId(id) || typeof name !== "string" || !Array.isArray(members))
      continue;
    if (groupIds.has(id)) continue;
    groupIds.add(id);
    groups.push({
      id,
      name: clampSidebarGroupName(name),
      collapsed: collapsed === true,
      agentIds: members.filter(claimAgent),
      ...(isSidebarStyle(icon, SIDEBAR_ICON_MAX_BYTES) ? { icon } : {}),
      ...(isSidebarStyle(color, SIDEBAR_COLOR_MAX_BYTES) ? { color } : {}),
    });
  }
  const order: SidebarRootEntry[] = [];
  const listedGroups = new Set<string>();
  for (const value of rawOrder(raw, groups)) {
    if (!isSidebarRecord(value)) continue;
    const { kind, id } = value;
    if (kind === "group") {
      if (!isSidebarId(id) || !groupIds.has(id) || listedGroups.has(id))
        continue;
      listedGroups.add(id);
      order.push({ kind, id });
    } else if (kind === "agent" && claimAgent(id)) order.push({ kind, id });
  }
  for (const group of groups)
    if (!listedGroups.has(group.id))
      order.push({ kind: "group", id: group.id });
  return { groups, order };
}
