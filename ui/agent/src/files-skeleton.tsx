/**
 * Loading placeholders for the Files body, mirroring the real row layout
 * one-for-one (in-tree checkbox slot, depth indent, column template). The real
 * list owns no header row, so the placeholders begin where its rows begin.
 *
 * The skeleton MOUNTS NOTHING for its first 150ms: a local read lands well
 * inside that window, so expanding a section goes straight from closed to the
 * real listing with no placeholder flashing tall and collapsing. Only a
 * genuinely slow read (cloud, cold cache) ever shows the skeleton, fading in
 * via `.files-skeleton-in`.
 */
import { cn, Skeleton } from "@houston-ai/core";
import { useEffect, useState } from "react";
import {
  ACTIONS_CELL,
  colGrid,
  LIST_INSET,
  META_CELL,
  NAME_CELL_INNER,
  ROW_CLASS,
  ROW_TILE,
  TRIANGLE_AREA,
} from "./files-list-chrome";
import { RowIndent } from "./files-list-indent";

/** Stable keys: the placeholder count is fixed, so no index-derived keys.
 *  THREE rows, deliberately few: inside the accordion the skeleton is a guess
 *  about a section it has never read, and a tall guess that collapses onto a
 *  two-file listing reads as a glitch. */
const ROW_KEYS = ["r1", "r2", "r3"];

const SKELETON_DELAY_MS = 150;

export function FilesListSkeleton({
  selectable,
  depth = 0,
}: {
  selectable?: boolean;
  depth?: number;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShow(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!show) return null;
  return (
    <div className={cn("files-skeleton-in flex flex-col", LIST_INSET)}>
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
              gridTemplateColumns: colGrid(),
            }}
          >
            <div className="flex h-full min-w-0 items-center">
              <RowIndent depth={depth} />
              <span
                className="flex h-full shrink-0 items-center justify-center"
                style={{ width: TRIANGLE_AREA }}
              >
                {selectable && <Skeleton className="size-3.5 rounded-[5px]" />}
              </span>
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
