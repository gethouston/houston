import { cn } from "@houston-ai/core";
import { sidebarRowHeight } from "./sidebar-geometry";
import { sidebarRowButtonClasses as c } from "./sidebar-paint";
import { type SidebarTreeRow, treeRowKey } from "./sidebar-tree";

export function emptyOpenGroupIds(rows: SidebarTreeRow[]): Set<string> {
  const empty = new Set<string>();
  rows.forEach((row, index) => {
    if (row.kind !== "group" || row.collapsed) return;
    const next = rows[index + 1];
    if (next?.kind === "agent" && next.parentId === row.id) return;
    empty.add(row.id);
  });
  return empty;
}

export function blockStartKeys(rows: SidebarTreeRow[]): Set<string> {
  const starts = new Set<string>();
  rows.forEach((row, index) => {
    const prev = rows[index - 1];
    if (!prev) return;
    const afterGroup = prev.kind === "group" || prev.parentId !== null;
    if (row.kind === "group" || (row.parentId === null && afterGroup))
      starts.add(treeRowKey(row));
  });
  return starts;
}

export function SidebarEmptyGroupHint({
  groupId,
  label,
}: {
  groupId: string;
  label: string;
}) {
  return (
    <div
      data-sidebar-empty-group={groupId}
      className={cn(
        "relative flex items-center text-xs text-ink-muted",
        sidebarRowHeight,
        c.depthChild,
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}
