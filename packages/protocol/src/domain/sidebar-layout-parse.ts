import {
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
  sidebarGroupNameTooLong,
} from "./sidebar-layout";

function parseGroup(value: unknown): SidebarGroup | null {
  if (!isSidebarRecord(value)) return null;
  const { id, name, collapsed, agentIds, icon, color } = value;
  if (
    !isSidebarId(id) ||
    typeof name !== "string" ||
    sidebarGroupNameTooLong(name) ||
    typeof collapsed !== "boolean" ||
    !Array.isArray(agentIds) ||
    !agentIds.every(isSidebarId) ||
    (icon !== undefined && !isSidebarStyle(icon, SIDEBAR_ICON_MAX_BYTES)) ||
    (color !== undefined && !isSidebarStyle(color, SIDEBAR_COLOR_MAX_BYTES))
  )
    return null;
  return {
    id,
    name,
    collapsed,
    agentIds: [...agentIds],
    ...(icon !== undefined ? { icon } : {}),
    ...(color !== undefined ? { color } : {}),
  };
}

function parseEntry(value: unknown): SidebarRootEntry | null {
  if (!isSidebarRecord(value)) return null;
  const { kind, id } = value;
  if ((kind !== "group" && kind !== "agent") || !isSidebarId(id)) return null;
  return { kind, id };
}

/**
 * The strict wire check both writers of a stored layout apply: the host route
 * and the gateway accept exactly the documents this accepts. Unknown keys are
 * ignored and only the pinned shape is projected.
 */
export function parseSidebarLayout(body: unknown): SidebarLayout | null {
  if (!isSidebarRecord(body)) return null;
  if (!Array.isArray(body.groups) || body.groups.length > SIDEBAR_GROUPS_MAX)
    return null;
  if (!Array.isArray(body.order)) return null;
  const groups: SidebarGroup[] = [];
  const groupIds = new Set<string>();
  const agentIds = new Set<string>();
  const claimAgent = (id: string) => {
    if (agentIds.has(id) || agentIds.size >= SIDEBAR_AGENT_IDS_MAX)
      return false;
    agentIds.add(id);
    return true;
  };
  for (const value of body.groups) {
    const group = parseGroup(value);
    if (!group || groupIds.has(group.id)) return null;
    groupIds.add(group.id);
    if (!group.agentIds.every(claimAgent)) return null;
    groups.push(group);
  }
  const order: SidebarRootEntry[] = [];
  const listedGroups = new Set<string>();
  for (const value of body.order) {
    const entry = parseEntry(value);
    if (!entry) return null;
    if (entry.kind === "group") {
      if (!groupIds.has(entry.id) || listedGroups.has(entry.id)) return null;
      listedGroups.add(entry.id);
    } else if (!claimAgent(entry.id)) return null;
    order.push(entry);
  }
  return { groups, order };
}
