import { Badge } from "@houston-ai/core";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface SidebarSectionItem<Id extends string> {
  id: Id;
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
  beta?: boolean;
}

interface SidebarSectionNavProps<Id extends string> {
  ariaLabel: string;
  items: SidebarSectionItem<Id>[];
  active: Id;
  onSelect: (id: Id) => void;
  footer?: ReactNode;
  className?: string;
}

export function SidebarSectionNav<Id extends string>({
  ariaLabel,
  items,
  active,
  onSelect,
  footer,
  className,
}: SidebarSectionNavProps<Id>) {
  return (
    <nav
      aria-label={ariaLabel}
      className={`relative w-56 shrink-0 px-3 py-6 overflow-y-auto flex flex-col before:absolute before:right-0 before:top-4 before:bottom-0 before:w-px before:bg-border ${className ?? ""}`}
    >
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === active;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors ${
                  isActive
                    ? "bg-secondary text-foreground"
                    : item.destructive
                      ? "text-destructive hover:bg-secondary/60"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.beta && (
                  <Badge
                    variant="outline"
                    className="ml-auto h-4 px-1.5 text-[9px] font-semibold tracking-wider text-muted-foreground"
                  >
                    BETA
                  </Badge>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {footer && <div className="mt-auto pt-4">{footer}</div>}
    </nav>
  );
}
