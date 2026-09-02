import { cn } from "@houston-ai/core";
import type { RefObject } from "react";
import { useCallback, useState } from "react";
import { nearestPageIndex } from "./board-pager";

/**
 * The phone board's segmented pager (rendered by `KanbanBoard` below md
 * only): one segment per column, synced both ways with the snap-scrolling
 * column container — swiping moves the highlight, tapping a segment scrolls
 * its page in. Presentational and store-free like the rest of the library;
 * the labels are the columns' own.
 */

export interface PagerPage {
  id: string;
  label: string;
  count: number;
}

/** Each page's left edge in the container's scroll coordinates. Pages share
 *  one offset parent, so the first column anchors the origin. */
function pageOffsets(container: HTMLElement): number[] {
  const pages = Array.from(
    container.querySelectorAll<HTMLElement>("[data-kanban-column]"),
  );
  const origin = pages[0]?.offsetLeft ?? 0;
  return pages.map((page) => page.offsetLeft - origin);
}

export function useBoardPager(scrollRef: RefObject<HTMLElement | null>) {
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    setActiveIndex(
      nearestPageIndex(container.scrollLeft, pageOffsets(container)),
    );
  }, [scrollRef]);

  const scrollToPage = useCallback(
    (index: number) => {
      const container = scrollRef.current;
      if (!container) return;
      const offset = pageOffsets(container)[index];
      if (offset === undefined) return;
      container.scrollTo({ left: offset, behavior: "smooth" });
      // Reflect the tap immediately: the smooth scroll's events land late, and
      // the segment must not lag the user's own choice.
      setActiveIndex(index);
    },
    [scrollRef],
  );

  return { activeIndex, handleScroll, scrollToPage };
}

export function KanbanPager({
  pages,
  activeIndex,
  onSelect,
}: {
  pages: PagerPage[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div
      data-testid="board-pager"
      className="flex shrink-0 gap-1 rounded-full bg-chip p-1 mx-3 mt-2"
    >
      {pages.map((page, index) => (
        <button
          key={page.id}
          type="button"
          data-board-page={page.id}
          aria-current={index === activeIndex ? "true" : undefined}
          onClick={() => onSelect(index)}
          className={cn(
            "flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            index === activeIndex ? "bg-background text-ink" : "text-ink-muted",
          )}
        >
          <span className="truncate">{page.label}</span>
          {page.count > 0 && (
            <span className="text-xs text-ink-muted tabular-nums">
              {page.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
