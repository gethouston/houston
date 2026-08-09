/**
 * Loading placeholders for the Files body. Each mirrors its real layout
 * one-for-one — the grid's chip row over its hero cards, the list's rows with
 * their checkbox gutter, indent and column template — so nothing shifts when
 * the listing arrives. Both header slots are drawn by spacing alone, exactly
 * like the real ones: no underline.
 */
import { cn, Skeleton } from "@houston-ai/core";
import {
  ACTIONS_CELL,
  colGrid,
  HEADER_ROW,
  LIST_INSET,
  META_CELL,
  NAME_CELL_INNER,
  ROW_CLASS,
  ROW_TILE,
} from "./files-list-chrome";
import { RowIndent } from "./files-list-indent";

/** Stable keys: the placeholder count is fixed, so no index-derived keys. */
const ROW_KEYS = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"];

export function FilesListSkeleton({ selectable }: { selectable?: boolean }) {
  return (
    <div className={cn("flex flex-col", LIST_INSET)}>
      <div className={HEADER_ROW} />
      <div className="shrink-0">
        {ROW_KEYS.map((key) => (
          <div
            key={key}
            aria-hidden
            // The real row's geometry without its hover: a placeholder is not
            // hoverable, and a fill chasing the cursor over dead rows reads as
            // a listing that is already interactive.
            className={cn(ROW_CLASS, "hover:bg-transparent")}
            style={{
              display: "grid",
              gridTemplateColumns: colGrid(!!selectable),
            }}
          >
            {selectable && (
              <span className="flex h-full items-center justify-center">
                <Skeleton className="size-4 rounded-[5px]" />
              </span>
            )}
            <div className="flex h-full min-w-0 items-center">
              <RowIndent depth={0} chevron />
              <div className={NAME_CELL_INNER}>
                <Skeleton className={cn("shrink-0", ROW_TILE)} />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <span className={META_CELL}>
              <Skeleton className="h-2.5 w-16" />
            </span>
            <span className={META_CELL}>
              <Skeleton className="h-2.5 w-10" />
            </span>
            {/* The actions column: a kebab is chrome, never a loading bar. */}
            <span className={ACTIONS_CELL} />
          </div>
        ))}
      </div>
    </div>
  );
}
