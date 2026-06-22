import { type ReactNode } from "react";
import { cn } from "../utils";

export interface HighlightRange {
  /** Inclusive start index into `text` (UTF-16 code units). */
  start: number;
  /** Exclusive end index into `text`. */
  end: number;
}

export interface HighlightedTextProps {
  /** Full text to render. */
  text: string;
  /** Spans of `text` to wrap in a highlight `<mark>`. Out-of-bounds, empty,
   *  unsorted, or overlapping ranges are all tolerated. */
  ranges?: HighlightRange[];
  /** Extra classes merged onto each `<mark>`. */
  markClassName?: string;
}

/** Theme-aware match highlight (see `--color-highlight` in globals.css). */
const MARK_CLASS =
  "rounded-[3px] bg-highlight px-0.5 text-highlight-foreground";

/**
 * Renders `text`, wrapping the given character `ranges` in a `<mark>` so search
 * matches stand out (e.g. the matched keyword in archived-mission search).
 *
 * Pure presentation: the caller decides which spans match (fold-aware search
 * lives app-side). Returns a Fragment, so it drops straight into a truncating
 * or line-clamping parent without introducing a wrapper element.
 */
export function HighlightedText({
  text,
  ranges,
  markClassName,
}: HighlightedTextProps) {
  const normalized = normalizeRanges(ranges, text.length);
  if (normalized.length === 0) return <>{text}</>;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  normalized.forEach((range, index) => {
    if (range.start > cursor) nodes.push(text.slice(cursor, range.start));
    nodes.push(
      <mark key={index} className={cn(MARK_CLASS, markClassName)}>
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));

  return <>{nodes}</>;
}

/** Clamp to bounds, drop empties, sort, and merge overlaps so rendering is a
 *  single forward pass no matter how the caller supplied the ranges. */
function normalizeRanges(
  ranges: HighlightRange[] | undefined,
  length: number,
): HighlightRange[] {
  if (!ranges || ranges.length === 0 || length === 0) return [];
  const clamped = ranges
    .map((r) => ({
      start: Math.max(0, Math.min(r.start, length)),
      end: Math.max(0, Math.min(r.end, length)),
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: HighlightRange[] = [];
  for (const r of clamped) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }
  return merged;
}
