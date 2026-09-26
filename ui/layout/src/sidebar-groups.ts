import type { ReactNode } from "react";
import type { SidebarItem } from "./sidebar-props";

export type SidebarRootEntry =
  | { kind: "group"; id: string }
  | { kind: "agent"; id: string };

export interface SidebarGroupView {
  id: string;
  name: string;
  collapsed: boolean;
  itemIds: string[];
  trailing?: ReactNode;
  icon?: ReactNode;
  affordance?: ReactNode;
  active?: boolean;
}

export interface SidebarSection {
  groupId: string | null;
  group: SidebarGroupView | null;
  items: SidebarItem[];
  rootAgentId?: string;
}

export function computeSidebarSections(
  items: SidebarItem[],
  groups: SidebarGroupView[],
  order: SidebarRootEntry[] = [],
): SidebarSection[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const grouped = new Set<string>();
  const groupSections = new Map(
    groups.map((group) => {
      const groupItems: SidebarItem[] = [];
      for (const id of group.itemIds) {
        const item = byId.get(id);
        if (item && !grouped.has(id)) {
          grouped.add(id);
          groupItems.push(item);
        }
      }
      return [
        group.id,
        { groupId: group.id, group, items: groupItems },
      ] as const;
    }),
  );
  const seen = new Set<string>();
  const ordered: SidebarSection[] = [];
  const add = (entry: SidebarRootEntry) => {
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) return;
    if (entry.kind === "group") {
      const section = groupSections.get(entry.id);
      if (section) ordered.push(section);
      else return;
    } else {
      const item = byId.get(entry.id);
      if (!item || grouped.has(entry.id)) return;
      ordered.push({
        groupId: null,
        group: null,
        items: [item],
        rootAgentId: item.id,
      });
    }
    seen.add(key);
  };
  for (const item of items) {
    if (
      !grouped.has(item.id) &&
      !order.some((entry) => entry.kind === "agent" && entry.id === item.id)
    )
      add({ kind: "agent", id: item.id });
  }
  for (const entry of order) add(entry);
  for (const group of groups) add({ kind: "group", id: group.id });
  return ordered;
}
