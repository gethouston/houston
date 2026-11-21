import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { cn } from "@houston-ai/core";
import type { KeyboardEvent, ReactNode } from "react";
import { sidebarRowType } from "./sidebar-geometry";
import { sidebarRowButtonClasses as c, sidebarRowState } from "./sidebar-paint";
import { SidebarRowCaret } from "./sidebar-row-caret";

export type SidebarRowDepth = "block" | "child";

export interface SidebarRowDisclosure {
  expanded: boolean;
  contentId?: string;
}

export type SidebarRowAnatomy = "row" | "person";

export interface SidebarRowButtonProps {
  label: string;
  anatomy?: SidebarRowAnatomy;
  subtitle?: ReactNode;
  icon?: ReactNode;
  depth?: SidebarRowDepth;
  active?: boolean;
  disclosure?: SidebarRowDisclosure;
  onActivate?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  trailing?: ReactNode;
  affordance?: ReactNode;
  draggable?: boolean;
  dragAttributes?: DraggableAttributes;
  dragListeners?: DraggableSyntheticListeners;
  dataAttrs?: Record<string, string>;
  title?: string;
}

export function SidebarRowButton({
  label,
  anatomy = "row",
  subtitle,
  icon,
  depth = "child",
  active,
  disclosure,
  onActivate,
  onKeyDown,
  trailing,
  affordance,
  draggable,
  dragAttributes,
  dragListeners,
  dataAttrs,
  title,
}: SidebarRowButtonProps) {
  const person = anatomy === "person";
  return (
    <div
      className={cn(
        c.root,
        person && [c.personHeight, c.personFill],
        active ? sidebarRowState.active : sidebarRowState.hover,
      )}
      {...(dataAttrs ?? {})}
    >
      <button
        type="button"
        title={title}
        aria-current={active ? "page" : undefined}
        aria-expanded={disclosure ? disclosure.expanded : undefined}
        aria-controls={disclosure?.contentId}
        onClick={onActivate}
        onKeyDown={onKeyDown}
        className={cn(
          c.button,
          person && c.personHeight,
          sidebarRowType.item,
          person
            ? depth === "block"
              ? c.personPadBlock
              : c.personPadChild
            : depth === "block"
              ? c.depthBlock
              : c.depthChild,
          active ? "text-ink" : sidebarRowState.restText,
          (draggable || dragListeners) && c.draggable,
        )}
        {...dragAttributes}
        {...dragListeners}
      >
        {icon !== undefined && (
          <span className={person ? c.personIcon : c.icon}>{icon}</span>
        )}
        {person ? (
          <span
            data-person-text=""
            className={cn(
              c.personText,
              (active || depth === "child") && c.personTextBare,
            )}
          >
            <span className={c.personLine}>
              <span className={c.personName}>{label}</span>
            </span>
            {(subtitle || trailing) && (
              <span className={c.personLine}>
                <span className={c.personRole}>{subtitle}</span>
                {trailing && <span className={c.personBadge}>{trailing}</span>}
              </span>
            )}
          </span>
        ) : (
          <>
            <span className={c.labelGroup}>
              <span className={c.label}>{label}</span>
              {disclosure && <SidebarRowCaret expanded={disclosure.expanded} />}
            </span>
            <span className={c.spacer} />
            {trailing && <span className={c.trailing}>{trailing}</span>}
          </>
        )}
      </button>
      {affordance}
    </div>
  );
}
