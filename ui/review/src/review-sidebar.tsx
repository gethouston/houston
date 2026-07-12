import { cn } from "@houston-ai/core";
import { useMemo } from "react";
import type { ReviewItemData } from "./types";

export interface ReviewSidebarProps {
  items: ReviewItemData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const GROUPS = [
  { label: "Needs You", statuses: ["needs_you"] },
  { label: "Running", statuses: ["running"] },
  { label: "Done", statuses: ["done", "approved", "completed"] },
  { label: "Failed", statuses: ["error", "failed"] },
];

export function ReviewSidebar({
  items,
  selectedId,
  onSelect,
}: ReviewSidebarProps) {
  const grouped = useMemo(() => {
    return GROUPS.map((group) => ({
      ...group,
      items: items
        .filter((item) => group.statuses.includes(item.status))
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    }));
  }, [items]);

  return (
    <div className="flex flex-col h-full bg-chip border-r border-line">
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {grouped.map((group) => (
          <div key={group.label} className="mb-1">
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-[11px] text-ink-muted">{group.label}</span>
              {group.items.length > 0 && (
                <span className="text-[11px] text-ink-muted/60">
                  {group.items.length}
                </span>
              )}
            </div>
            {group.items.length > 0 ? (
              group.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 rounded-lg transition-colors duration-100 text-[13px] truncate",
                    item.id === selectedId
                      ? "bg-hover text-ink"
                      : "text-hover-text hover:bg-hover/50",
                  )}
                >
                  {item.title}
                </button>
              ))
            ) : (
              <p className="px-3 py-1 text-[12px] text-ink-muted/60 italic">
                None
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
