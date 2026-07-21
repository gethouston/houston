/**
 * List-view chrome: the quiet, sortable column header cell.
 */
import { cn } from "@houston-ai/core";
import type { SortDirection, SortKey } from "./utils";

export function HeaderCell({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={cn(
        "flex h-full items-center justify-between px-2 text-[11px] font-medium text-ink-muted transition-colors hover:text-ink",
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
