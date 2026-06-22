import type { ReactNode } from "react";
import { cn } from "@houston-ai/core";

export interface TabBarProps {
  title?: string;
  tabs: {
    id: string;
    label: string;
    badge?: number;
    /** Disable the tab (non-clickable, muted). */
    disabled?: boolean;
    /** Optional text chip shown next to the label (e.g. "Soon"). */
    chip?: string;
  }[];
  activeTab: string;
  onTabChange: (id: string) => void;
  actions?: ReactNode;
  menu?: ReactNode;
}

export function TabBar({
  title,
  tabs,
  activeTab,
  onTabChange,
  actions,
  menu,
}: TabBarProps) {
  return (
    <div className="shrink-0 px-5 pt-4">
      {/* Title row + menu + actions */}
      {(title || menu || actions) && (
        <div className="flex items-center gap-2 mb-3">
          {title && (
            <h1 className="shrink-0 text-xl font-semibold text-foreground">
              {title}
            </h1>
          )}
          {menu}
          {actions && (
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
              {actions}
            </div>
          )}
        </div>
      )}

      {/* Tab strip */}
      <div className="flex items-center gap-5">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const isDisabled = tab.disabled;
          return (
            <button
              type="button"
              key={tab.id}
              data-tour-target={`tab-${tab.id}`}
              onClick={() => !isDisabled && onTabChange(tab.id)}
              disabled={isDisabled}
              className={cn(
                "relative flex items-center gap-1.5 pb-2.5 text-sm transition-colors duration-200",
                isDisabled
                  ? "text-muted-foreground/50 cursor-not-allowed"
                  : isActive
                    ? "text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.chip && (
                <span className="inline-flex items-center h-[16px] px-1.5 rounded-full text-[10px] font-medium bg-accent text-muted-foreground">
                  {tab.chip}
                </span>
              )}
              {tab.badge != null && tab.badge > 0 && (
                <span
                  className={cn(
                    "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-xs font-medium",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-accent text-accent-foreground",
                  )}
                >
                  {tab.badge}
                </span>
              )}
              {isActive && !isDisabled && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
