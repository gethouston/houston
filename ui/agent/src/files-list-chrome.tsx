/**
 * List-view chrome: sortable column header cell and the decorative filler
 * stripes that pad the tree to full height.
 */
import { cn } from "@houston-ai/core";
import { useEffect, useRef, useState } from "react";
import type { SortDirection, SortKey } from "./utils";

export function HeaderCell({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
  last,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
  last?: boolean;
}) {
  const active = sortKey === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={cn(
        "flex h-full items-center justify-between px-2 text-[11px] font-medium text-ink-muted transition-colors hover:bg-chip-subtle",
        !last && "border-r border-line",
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {active && (
        <svg
          className="size-[8px] shrink-0"
          viewBox="0 0 8 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          role="img"
          aria-label={
            sortDir === "asc" ? "sorted ascending" : "sorted descending"
          }
        >
          {sortDir === "asc" ? (
            <path d="M1 4.5L4 1.5L7 4.5" />
          ) : (
            <path d="M1 1.5L4 4.5L7 1.5" />
          )}
        </svg>
      )}
    </button>
  );
}

/** Fills remaining vertical space with real rounded stripe divs. */
export function FillerStripes({
  startIndex,
  onDeselect,
  onContextMenu,
}: {
  startIndex: number;
  onDeselect: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const h = el.clientHeight;
      setCount(Math.ceil(h / 24));
    };
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="mx-1 min-h-0 flex-1">
      {Array.from({ length: count }, (_, i) => {
        const rowIndex = startIndex + i;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: decorative filler stripe; click-to-deselect and right-click-for-context-menu are pointer-only background gestures with no keyboard equivalent
          // biome-ignore lint/a11y/useKeyWithClickEvents: same rationale as noStaticElementInteractions above
          <div
            key={`filler-${rowIndex}`}
            className={cn(
              "h-[24px]",
              rowIndex % 2 === 1 && "rounded-lg bg-chip-subtle/30",
            )}
            onClick={onDeselect}
            onContextMenu={onContextMenu}
          />
        );
      })}
    </div>
  );
}
