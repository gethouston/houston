import type { ReactNode } from "react";
import { cn } from "../utils";
import {
  FLOATING_NAV_ACTION_CLASSES,
  FLOATING_NAV_PILL_CLASSES,
  floatingNavItemClasses,
} from "./floating-nav-bar-styles";

export interface FloatingNavBarItem {
  /** Stable React key. Never rendered. */
  id: string;
  /** Names the item for a screen reader, and is the visible word while the
   *  item is active. */
  label: string;
  icon: ReactNode;
  active?: boolean;
  /** Count chip drawn over the icon's top-right corner. */
  badge?: ReactNode;
  /** Extra DOM attributes (e.g. `data-tour-target`) on the rendered button. */
  dataAttrs?: Record<string, string>;
  onSelect: () => void;
}

export interface FloatingNavBarAction {
  label: string;
  icon: ReactNode;
  dataAttrs?: Record<string, string>;
  onSelect: () => void;
}

export interface FloatingNavBarProps {
  /** Names the `<nav>` landmark. */
  label: string;
  items: FloatingNavBarItem[];
  /** The round button beside the pill — a create action, not a destination,
   *  which is why it sits OUTSIDE the pill and carries no active state. */
  action?: FloatingNavBarAction;
  /** Extra DOM attributes on the `<nav>` (e.g. a test id). */
  dataAttrs?: Record<string, string>;
  className?: string;
}

/**
 * A floating pill navigation bar for small viewports: a rounded bar of
 * icon-only destinations that lifts off the bottom edge, plus an optional
 * round action button beside it.
 *
 * Only the active item shows its label, inside a darker inner pill. Three
 * labels side by side would either wrap or shrink the type below the readable
 * floor on a narrow phone, and the active one is the only label that answers
 * a question the user actually has.
 *
 * The wrapper pads `pb-safe` so the home indicator never covers the targets;
 * that padding is on the landmark and the visual inset is on the row inside
 * it, because a single element cannot carry two padding-bottoms.
 */
export function FloatingNavBar({
  label,
  items,
  action,
  dataAttrs,
  className,
}: FloatingNavBarProps) {
  return (
    <nav
      aria-label={label}
      className={cn("shrink-0 pb-safe", className)}
      {...dataAttrs}
    >
      <div className="flex items-center gap-2 px-4 pb-3">
        <div className={FLOATING_NAV_PILL_CLASSES}>
          {items.map((item) => {
            const active = item.active === true;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                onClick={item.onSelect}
                className={floatingNavItemClasses(active)}
                {...item.dataAttrs}
              >
                <span className="relative flex items-center justify-center">
                  {item.icon}
                  {item.badge && (
                    <span className="-top-2 -right-3 absolute">
                      {item.badge}
                    </span>
                  )}
                </span>
                {active && (
                  <span className="font-weight-510 text-sm">{item.label}</span>
                )}
              </button>
            );
          })}
        </div>
        {action && (
          <button
            type="button"
            aria-label={action.label}
            onClick={action.onSelect}
            className={FLOATING_NAV_ACTION_CLASSES}
            {...action.dataAttrs}
          >
            {action.icon}
          </button>
        )}
      </div>
    </nav>
  );
}
