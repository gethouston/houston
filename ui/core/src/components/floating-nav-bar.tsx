import type { ReactNode } from "react";
import { cn } from "../utils";
import {
  FLOATING_NAV_ACTION_CLASSES,
  FLOATING_NAV_PILL_CLASSES,
  floatingNavItemClasses,
} from "./floating-nav-bar-styles";

export interface FloatingNavBarItem {
  id: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  expanded?: boolean;
  badge?: ReactNode;
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
  label: string;
  items: FloatingNavBarItem[];
  action?: FloatingNavBarAction;
  dataAttrs?: Record<string, string>;
  className?: string;
}

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
            const active = item.active === true || item.expanded === true;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                aria-current={item.active ? "page" : undefined}
                aria-expanded={item.expanded}
                onClick={item.onSelect}
                className={floatingNavItemClasses(active)}
                {...item.dataAttrs}
              >
                <span className="relative flex items-center justify-center">
                  {item.icon}
                  {item.badge && !active && (
                    <span className="-top-2.5 -right-4 absolute">
                      {item.badge}
                    </span>
                  )}
                </span>
                {active && (
                  <span className="font-weight-510 text-sm">{item.label}</span>
                )}
                {active && item.badge}
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
