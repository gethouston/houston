/**
 * Loading placeholders for the Files body. Each mirrors its real layout
 * one-for-one — same card shell, same column grid, same row height — so
 * nothing shifts when the listing arrives.
 */
import { Skeleton } from "@houston-ai/core";
import { cardClass, cardHeaderClass, cardPreviewClass } from "./card-chrome";
import { BASE_INDENT, COL_GRID, TRIANGLE_AREA } from "./files-list-chrome";

/** Stable keys: the placeholder count is fixed, so no index-derived keys. */
const CARD_KEYS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
const ROW_KEYS = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"];

export function FilesGridSkeleton() {
  return (
    <div className="grid shrink-0 grid-cols-[repeat(auto-fill,minmax(180px,1fr))] content-start gap-3 pt-1">
      {CARD_KEYS.map((key) => (
        <div key={key} aria-hidden className={cardClass({})}>
          <div className={cardHeaderClass()}>
            <Skeleton className="size-4 shrink-0 rounded-sm" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className={cardPreviewClass} />
          {/* Block + inline bar, not flex: the text line box is what gives
              the real CardMeta its height, so the card totals the same. */}
          <div className="px-2 pt-1.5 pb-2 text-xs">
            <Skeleton className="inline-block h-2.5 w-16 align-middle" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FilesListSkeleton() {
  return (
    <>
      <div className="h-8 shrink-0 border-line border-b" />
      <div className="shrink-0 pt-1">
        {ROW_KEYS.map((key) => (
          <div
            key={key}
            aria-hidden
            className="h-8 items-center"
            style={{ display: "grid", gridTemplateColumns: COL_GRID }}
          >
            <div
              className="flex min-w-0 items-center gap-1.5"
              style={{ paddingLeft: BASE_INDENT + TRIANGLE_AREA }}
            >
              <Skeleton className="size-4 shrink-0 rounded-sm" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="mx-2 h-2.5 w-24" />
            <Skeleton className="mx-2 h-2.5 w-24" />
            <Skeleton className="mx-2 h-2.5 w-10 justify-self-end" />
            <Skeleton className="mx-2 h-2.5 w-16" />
            {/* The actions column: a kebab is chrome, never a loading bar. */}
            <span />
          </div>
        ))}
      </div>
    </>
  );
}
