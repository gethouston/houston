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
            <span className={ACTIONS_CELL} />
          </div>
        ))}
      </div>
    </div>
  );
}
