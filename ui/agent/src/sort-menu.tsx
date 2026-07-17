/**
 * Compact sort dropdown for the grid view (list view sorts via its column
 * headers). Reselecting the active key flips direction, like the columns.
 */
import { cn } from "@houston-ai/core";
import { ArrowDown, ArrowUp, ArrowUpDown, Check } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { SortDirection, SortKey } from "./utils";

export interface SortMenuLabels {
  sortBy: string;
  name: string;
  dateModified: string;
  dateCreated: string;
  size: string;
  kind: string;
}

const KEYS: SortKey[] = ["name", "dateModified", "dateCreated", "size", "kind"];

export function SortMenu({
  sortKey,
  sortDir,
  onSort,
  labels,
}: {
  sortKey: SortKey;
  sortDir: SortDirection;
  onSort: (key: SortKey) => void;
  labels: SortMenuLabels;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const DirIcon = sortDir === "asc" ? ArrowUp : ArrowDown;

  return (
    <>
      <button
        type="button"
        aria-label={labels.sortBy}
        title={labels.sortBy}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setMenu({ x: Math.max(8, rect.right - 180), y: rect.bottom + 4 });
        }}
        className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-ink-muted transition-colors hover:bg-hover hover:text-ink"
      >
        <ArrowUpDown aria-hidden className="size-3.5" />
        <span className="hidden sm:inline">{labels[sortKey]}</span>
        <DirIcon aria-hidden className="size-3" />
      </button>
      {menu &&
        createPortal(
          <>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay for click-outside dismissal, same pattern as FileMenu */}
            <div
              role="presentation"
              className="fixed inset-0 z-40"
              onClick={() => setMenu(null)}
              onKeyDown={(e) => e.key === "Escape" && setMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu(null);
              }}
            />
            <div
              role="menu"
              className="fixed z-50 min-w-[180px] rounded-md border bg-popover p-1 text-popover-text shadow-md"
              style={{ left: menu.x, top: menu.y }}
              onKeyDown={(e) => e.key === "Escape" && setMenu(null)}
            >
              {KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onSort(key);
                    setMenu(null);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none hover:bg-hover",
                    key === sortKey ? "text-ink" : "text-ink-muted",
                  )}
                >
                  <span className="flex-1 text-left">{labels[key]}</span>
                  {key === sortKey && (
                    <>
                      <DirIcon aria-hidden className="size-3.5" />
                      <Check aria-hidden className="size-3.5" />
                    </>
                  )}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
