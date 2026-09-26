import type { SidebarLayout, SidebarRootEntry } from "@houston/engine-adapter";
import {
  createGroupOp,
  setGroupIdentityOp,
} from "./sidebar-layout-group-ops.ts";

export {
  DEFAULT_SIDEBAR_LAYOUT,
  normalizeSidebarLayout,
} from "@houston/protocol";
export {
  createGroupOp,
  deleteGroupOp,
  renameGroupOp,
  setGroupIdentityOp,
  toggleGroupCollapsedOp,
} from "./sidebar-layout-group-ops.ts";

export interface ItemDest {
  groupId: string | null;
  beforeItemId: string | null;
}

/** Keep stored items absent from a rendered drop beside their old successor. */
function retainUnrendered<T>(
  stored: T[],
  rendered: T[],
  key: (item: T) => string,
  mentioned: ReadonlySet<string>,
): T[] {
  const result = [...rendered];
  for (let index = 0; index < stored.length; index++) {
    const item = stored[index];
    if (mentioned.has(key(item))) continue;
    const successor = stored
      .slice(index + 1)
      .find((candidate) =>
        result.some((entry) => key(entry) === key(candidate)),
      );
    const at = successor
      ? result.findIndex((entry) => key(entry) === key(successor))
      : result.length;
    result.splice(at, 0, item);
  }
  return result;
}

export function createGroupWithIdentityOp(
  layout: SidebarLayout,
  id: string,
  name: string,
  before: SidebarRootEntry | null,
  identity: { icon?: string; color?: string } = {},
): SidebarLayout {
  return setGroupIdentityOp(
    createGroupOp(layout, id, name, before),
    id,
    identity,
  );
}

function insertBefore<T>(list: T[], value: T, beforeIndex: number): T[] {
  return [...list.slice(0, beforeIndex), value, ...list.slice(beforeIndex)];
}

function rootIndex(
  order: SidebarRootEntry[],
  before: SidebarRootEntry | null,
): number {
  if (!before) return order.length;
  const index = order.findIndex(
    (entry) => entry.kind === before.kind && entry.id === before.id,
  );
  return index < 0 ? order.length : index;
}

export function remapAgentIdOp(
  layout: SidebarLayout,
  oldId: string,
  newId: string,
): SidebarLayout {
  if (oldId === newId) return layout;
  const winnerGroup = layout.groups.find((group) =>
    group.agentIds.includes(oldId),
  );
  const hasRoot = layout.order.some(
    (entry) => entry.kind === "agent" && entry.id === oldId,
  );
  if (!winnerGroup && !hasRoot) return layout;
  const groups = layout.groups.map((group) => ({
    ...group,
    agentIds: group.agentIds.flatMap((id) =>
      id === oldId
        ? group === winnerGroup
          ? [newId]
          : []
        : id === newId
          ? []
          : [id],
    ),
  }));
  let replaced = false;
  const order = layout.order.flatMap<SidebarRootEntry>((entry) => {
    if (entry.kind !== "agent") return [entry];
    if (entry.id === newId) return [];
    if (entry.id !== oldId) return [entry];
    if (winnerGroup || replaced) return [];
    replaced = true;
    return [{ kind: "agent" as const, id: newId }];
  });
  return { groups, order };
}

export function moveItemOp(
  layout: SidebarLayout,
  agentId: string,
  dest: ItemDest,
): SidebarLayout {
  if (
    dest.groupId !== null &&
    !layout.groups.some((group) => group.id === dest.groupId)
  )
    return layout;
  const groups = layout.groups.map((group) => ({
    ...group,
    agentIds: group.agentIds.filter((id) => id !== agentId),
  }));
  const order = layout.order.filter(
    (entry) => entry.kind !== "agent" || entry.id !== agentId,
  );
  if (dest.groupId === null) {
    const before = dest.beforeItemId
      ? { kind: "agent" as const, id: dest.beforeItemId }
      : null;
    return {
      groups,
      order: insertBefore(
        order,
        { kind: "agent", id: agentId },
        rootIndex(order, before),
      ),
    };
  }
  const target = groups.find((group) => group.id === dest.groupId);
  if (!target) return layout;
  const index = dest.beforeItemId
    ? target.agentIds.indexOf(dest.beforeItemId)
    : -1;
  target.agentIds = insertBefore(
    target.agentIds,
    agentId,
    index < 0 ? target.agentIds.length : index,
  );
  return { groups, order };
}

/** Store a drop while retaining items absent from the rendered arrangement. */
export function arrangeOp(
  layout: SidebarLayout,
  arrangement: {
    order: SidebarRootEntry[];
    members: Record<string, string[]>;
  },
): SidebarLayout {
  // Members of a group the fresh layout lost are placed nowhere, so they must
  // not count as mentioned: their stored slot is all they have.
  const mentionedAgents = new Set([
    ...arrangement.order.flatMap((entry) =>
      entry.kind === "agent" ? [entry.id] : [],
    ),
    ...layout.groups.flatMap((group) => arrangement.members[group.id] ?? []),
  ]);
  return {
    order: retainUnrendered(
      layout.order,
      arrangement.order,
      (entry) => `${entry.kind}:${entry.id}`,
      new Set([
        ...arrangement.order.map((entry) => `${entry.kind}:${entry.id}`),
        ...[...mentionedAgents].map((id) => `agent:${id}`),
      ]),
    ),
    groups: layout.groups.map((group) => ({
      ...group,
      agentIds: retainUnrendered(
        group.agentIds,
        arrangement.members[group.id] ?? [],
        (id) => id,
        mentionedAgents,
      ),
    })),
  };
}
