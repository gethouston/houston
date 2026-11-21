import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@houston-ai/core";
import type { KeyboardEvent } from "react";
import { SidebarGroupHeader } from "./sidebar-group-header";
import type { SidebarGroupView } from "./sidebar-groups";
import { SidebarItemRow } from "./sidebar-item-row";
import { sidebarBlockGap, sidebarRowNeighbour } from "./sidebar-paint";
import type { SidebarItem } from "./sidebar-props";
import type { SidebarRowContext } from "./sidebar-row-context";
import {
  type SidebarKeyboardDirection,
  type SidebarTreeRow,
  treeRowKey,
} from "./sidebar-tree";

export interface SidebarTreeRowViewProps {
  row: SidebarTreeRow;
  item?: SidebarItem;
  group?: SidebarGroupView;
  ctx: SidebarRowContext;
  ghost: SidebarTreeRow | null;
  disabled?: boolean;
  opensBlock?: boolean;
  onActivateGroup?: (groupId: string) => void;
  onKeyboardMove?: (
    activeKey: string,
    direction: SidebarKeyboardDirection,
  ) => void;
}

export function SidebarTreeRowView({
  row,
  item,
  group,
  ctx,
  ghost,
  disabled = false,
  opensBlock = false,
  onActivateGroup,
  onKeyboardMove,
}: SidebarTreeRowViewProps) {
  const sortable = useSortable({ id: treeRowKey(row), disabled });
  const shown = ghost ?? row;
  const inGroup = shown.kind === "agent" && shown.parentId !== null;
  const member = row.kind === "agent" && row.parentId !== null;
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (
      onKeyboardMove &&
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey
    ) {
      const direction = (
        {
          ArrowUp: "up",
          ArrowDown: "down",
          ArrowLeft: "left",
          ArrowRight: "right",
        } as const
      )[event.key as "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight"];
      if (direction) {
        event.preventDefault();
        onKeyboardMove(treeRowKey(row), direction);
      }
      return;
    }
    if (
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      if (row.kind === "agent") ctx.onSelect(row.id);
      else onActivateGroup?.(row.id);
    }
  };
  return (
    <div
      ref={sortable.setNodeRef}
      data-sidebar-row=""
      data-sidebar-item={row.kind === "agent" ? "" : undefined}
      data-item-id={row.kind === "agent" ? row.id : undefined}
      data-sidebar-member-of={member ? row.parentId : undefined}
      data-sidebar-group={row.kind === "group" ? row.id : undefined}
      style={{
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={cn(
        "relative touch-manipulation",
        sidebarRowNeighbour,
        member && "sidebar-disclosure-in",
        opensBlock && sidebarBlockGap,
        sortable.isDragging && "opacity-40",
      )}
    >
      {row.kind === "agent" && item ? (
        <SidebarItemRow
          item={item}
          isActive={item.id === ctx.selectedId}
          onSelect={ctx.onSelect}
          dragAttributes={sortable.attributes}
          dragListeners={sortable.listeners}
          onKeyDown={onKeyDown}
          grouped={inGroup}
        />
      ) : group ? (
        <SidebarGroupHeader
          name={group.name}
          icon={group.icon}
          trailing={group.trailing}
          affordance={group.affordance}
          collapsed={group.collapsed}
          active={group.active}
          onActivate={() => onActivateGroup?.(group.id)}
          dragAttributes={sortable.attributes}
          dragListeners={sortable.listeners}
          onKeyDown={onKeyDown}
          dataAttrs={{ "data-sidebar-group-header": group.id }}
        />
      ) : null}
    </div>
  );
}
