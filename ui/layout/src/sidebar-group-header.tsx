import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import type { KeyboardEvent, ReactNode } from "react";
import { SidebarRowButton } from "./sidebar-row-button";

export interface SidebarGroupHeaderProps {
  name: string;
  icon?: ReactNode;
  trailing?: ReactNode;
  affordance?: ReactNode;
  collapsed: boolean;
  active?: boolean;
  onActivate?: () => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  dataAttrs?: Record<string, string>;
}

export function SidebarGroupHeader({
  name,
  icon,
  trailing,
  affordance,
  collapsed,
  active,
  onActivate,
  dragAttributes,
  dragListeners,
  onKeyDown,
  dataAttrs,
}: SidebarGroupHeaderProps) {
  return (
    <SidebarRowButton
      label={name}
      icon={icon}
      trailing={trailing}
      affordance={affordance}
      depth="block"
      active={active}
      title={name}
      onActivate={onActivate}
      disclosure={{ expanded: !collapsed }}
      dragAttributes={dragAttributes}
      dragListeners={dragListeners}
      onKeyDown={onKeyDown}
      dataAttrs={dataAttrs}
    />
  );
}
