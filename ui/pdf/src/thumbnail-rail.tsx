import { cn } from "@houston-ai/core";
import { memo, useEffect, useRef } from "react";
import { renderPageCanvas } from "./page-render";
import type { PdfDocumentHandle } from "./use-pdf-document";

const THUMB_WIDTH = 92;

const Thumb = memo(function Thumb({
  handle,
  page,
  active,
  count,
  label,
  onPick,
  onError,
}: {
  handle: PdfDocumentHandle;
  page: number;
  active: boolean;
  count: number;
  label: string;
  onPick: (page: number) => void;
  onError: (error: unknown) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const host = useRef<HTMLSpanElement>(null);
  const size = handle.sizes[page - 1];
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const abort = new AbortController();
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      renderPageCanvas(handle.doc, page, THUMB_WIDTH, abort.signal).then(
        (canvas) => {
          if (!canvas) return;
          canvas.className = "pdf-thumb-canvas";
          el.replaceChildren(canvas);
        },
        onError,
      );
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      abort.abort();
    };
  }, [handle, page, onError]);
  useEffect(() => {
    if (active) button.current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <button
      ref={button}
      type="button"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={() => onPick(page)}
      className="pdf-thumb group flex items-start gap-2 rounded-lg p-1 text-left"
    >
      <span
        className={cn(
          "w-3 shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-ink-muted",
          active && "font-semibold text-ink",
        )}
      >
        {page}
      </span>
      <span
        ref={host}
        data-theme="light"
        className="pdf-thumb-frame relative block flex-1 overflow-hidden rounded-md bg-hover"
        style={{
          aspectRatio: size ? `${size.width} / ${size.height}` : "16 / 9",
        }}
      />
      {count > 0 && (
        <span className="pdf-count absolute -top-1 -right-1" aria-hidden>
          {count}
        </span>
      )}
    </button>
  );
});

export interface ThumbnailRailProps {
  handle: PdfDocumentHandle;
  active: number;
  /** Comments per page, for the count badges. */
  counts: ReadonlyMap<number, number>;
  heading: string;
  thumbLabel: (page: number, count: number) => string;
  onPick: (page: number) => void;
  onError: (error: unknown) => void;
  className?: string;
}

/** Every page as a small preview: the current one ringed, comment counts on
 *  the ones that have them. Follows the reader as the pages scroll. */
export function ThumbnailRail({
  handle,
  active,
  counts,
  heading,
  thumbLabel,
  onPick,
  onError,
  className,
}: ThumbnailRailProps) {
  return (
    <nav
      aria-label={heading}
      className={cn("flex min-h-0 flex-col", className)}
    >
      <p className="px-3 pt-3 pb-1.5 text-xs text-ink-muted">{heading}</p>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-4">
        {handle.sizes.map((_, i) => {
          const page = i + 1;
          const count = counts.get(page) ?? 0;
          return (
            <div key={page} className="relative">
              <Thumb
                handle={handle}
                page={page}
                active={page === active}
                count={count}
                label={thumbLabel(page, count)}
                onPick={onPick}
                onError={onError}
              />
            </div>
          );
        })}
      </div>
    </nav>
  );
}
