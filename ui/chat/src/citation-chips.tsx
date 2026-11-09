import { cn } from "@houston-ai/core";
import { TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** One comment pinned to a file region, as a chip or a pill shows it. */
export interface CitationChipData {
  id: string;
  /** The number its mark on the page shows. */
  n: number;
  /** Where it points: "Slide 3 · “quote”", "Slide 5 · Selected area". */
  context: string;
  comment: string;
  thumbnailSrc?: string;
  /** Set when the page it points at no longer exists. */
  warning?: string;
}

export interface CitationChipRowLabels {
  /** The row's accessible name. */
  region?: string;
  /** Shown for a comment left empty. */
  noComment?: string;
  open?: (chip: CitationChipData) => string;
  remove?: (chip: CitationChipData) => string;
}

export function CitationNumber({
  n,
  className,
}: {
  n: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-full bg-action text-[10px] font-semibold text-action-text tabular-nums ring-2 ring-background",
        className,
      )}
    >
      {n}
    </span>
  );
}

/**
 * The comments waiting in the composer: one fixed-height row that scrolls
 * sideways, so adding a comment never grows the composer past one row.
 * Hovering or focusing a chip lights its mark on the page; pressing it brings
 * the mark into view.
 */
export function CitationChipRow({
  chips,
  hotId,
  onHot,
  onOpen,
  onRemove,
  labels = {},
}: {
  chips: readonly CitationChipData[];
  hotId?: string | null;
  onHot?: (id: string | null) => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  labels?: CitationChipRowLabels;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(true);
  const count = chips.length;
  useEffect(() => {
    const el = row.current;
    if (!el || count === 0) return;
    el.scrollTo({ left: el.scrollWidth });
    setAtEnd(true);
  }, [count]);
  if (count === 0) return null;
  return (
    <section
      ref={row}
      aria-label={labels.region ?? "Comments for the agent"}
      onScroll={(e) => {
        const el = e.currentTarget;
        setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
      }}
      className={cn(
        "citation-row flex gap-1.5 overflow-x-auto px-1.5 pt-1.5 pb-0.5",
        !atEnd && "citation-row-fade",
      )}
    >
      {chips.map((chip) => (
        <div
          key={chip.id}
          data-hot={hotId === chip.id ? "true" : undefined}
          onPointerEnter={() => onHot?.(chip.id)}
          onPointerLeave={() => onHot?.(null)}
          className="citation-chip relative flex h-13 w-62 shrink-0 items-center rounded-[22px] bg-card-solid ring-1 ring-line-input ring-inset"
        >
          <button
            type="button"
            onClick={() => onOpen(chip.id)}
            onFocus={() => onHot?.(chip.id)}
            onBlur={() => onHot?.(null)}
            aria-label={labels.open?.(chip)}
            className="citation-press flex h-full min-w-0 flex-1 items-center gap-2 rounded-[22px] py-1.5 pr-1 pl-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span className="relative h-10 w-13 shrink-0">
              {chip.thumbnailSrc ? (
                <img
                  alt=""
                  src={chip.thumbnailSrc}
                  className="size-full rounded-2xl object-cover ring-1 ring-line ring-inset"
                />
              ) : (
                <span className="block size-full rounded-2xl bg-hover" />
              )}
              <CitationNumber
                n={chip.n}
                className="absolute -top-0.5 -left-0.5"
              />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1 truncate text-xs text-ink-muted">
                {chip.warning && (
                  <TriangleAlert className="size-3 shrink-0 text-warning-ink" />
                )}
                <span className="truncate">{chip.warning ?? chip.context}</span>
              </span>
              <span
                className={cn(
                  "truncate text-[13px] font-medium text-ink",
                  !chip.comment && "font-normal text-ink-muted",
                )}
              >
                {chip.comment || labels.noComment || "No comment"}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => onRemove(chip.id)}
            aria-label={labels.remove?.(chip) ?? `Remove comment ${chip.n}`}
            className="citation-press mr-1.5 grid size-7 shrink-0 place-items-center rounded-full text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </section>
  );
}
