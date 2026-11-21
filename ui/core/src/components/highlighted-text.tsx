import type { ReactNode } from "react";
import { cn } from "../utils";

export interface HighlightRange {
  start: number;
  end: number;
}

export interface HighlightedTextProps {
  text: string;
  ranges?: HighlightRange[];
  markClassName?: string;
}

const MARK_CLASS = "rounded-[3px] bg-highlight px-0.5 text-highlight-text";

export function HighlightedText({
  text,
  ranges,
  markClassName,
}: HighlightedTextProps) {
  const normalized = normalizeRanges(ranges, text.length);
  if (normalized.length === 0) return <>{text}</>;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  normalized.forEach((range) => {
    if (range.start > cursor) nodes.push(text.slice(cursor, range.start));
    nodes.push(
      <mark key={range.start} className={cn(MARK_CLASS, markClassName)}>
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));

  return <>{nodes}</>;
}

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
