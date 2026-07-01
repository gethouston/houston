/**
 * The scrollable columns inside the TimePicker popover. Kept apart from
 * time-picker.tsx so each file stays small; these are presentational and own no
 * time logic — the parent computes values and hands selection callbacks down.
 */

import { cn } from "@houston-ai/core";
import { useEffect, useRef } from "react";
import {
  centerPadding,
  centerScrollTop,
  type Period,
  pad2,
} from "./time-picker-utils.ts";

/**
 * One scrollable column of zero-padded numbers. The selected value is kept
 * centered: the column is padded at both ends so even the first/last number can
 * sit dead-center, and `scrollTop` is re-set whenever the selection changes so
 * the current value never drifts off-center. We set `scrollTop` directly rather
 * than `scrollIntoView` so only the column scrolls — never the page or popover.
 */
export function TimeColumn({
  ariaLabel,
  options,
  selected,
  onSelect,
}: {
  ariaLabel: string;
  options: number[];
  selected: number;
  onSelect: (n: number) => void;
}) {
  const containerRef = useRef<HTMLFieldSetElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `selected` is a genuine dep — the effect must re-run whenever the selection changes to re-center the column. Refs are not deps.
  useEffect(() => {
    const c = containerRef.current;
    const el = selectedRef.current;
    if (!c || !el) return;
    // Pad the ends so the extreme values can also center, then bring the current
    // selection to the middle. (offsetTop reflects the padding once it's set.)
    c.style.paddingBlock = `${centerPadding(c.clientHeight, el.clientHeight)}px`;
    c.scrollTop = centerScrollTop(
      el.offsetTop,
      c.clientHeight,
      el.clientHeight,
    );
  }, [selected]);

  return (
    <fieldset
      ref={containerRef}
      aria-label={ariaLabel}
      className="relative flex h-28 w-14 flex-col gap-0.5 overflow-y-auto scroll-smooth border-0 p-0 m-0 min-w-0"
    >
      {options.map((n) => {
        const on = n === selected;
        return (
          <button
            key={n}
            ref={on ? selectedRef : undefined}
            type="button"
            aria-label={`${ariaLabel} ${n}`}
            aria-pressed={on}
            onClick={() => onSelect(n)}
            className={cn(
              "shrink-0 rounded-md py-1.5 text-center text-sm tabular-nums transition-colors",
              on
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {pad2(n)}
          </button>
        );
      })}
    </fieldset>
  );
}

/** The AM/PM column, shown only for 12-hour locales. */
export function PeriodColumn({
  ariaLabel,
  periods,
  selected,
  onSelect,
}: {
  ariaLabel: string;
  periods: { am: string; pm: string };
  selected: Period;
  onSelect: (p: Period) => void;
}) {
  const items: { key: Period; label: string }[] = [
    { key: "am", label: periods.am },
    { key: "pm", label: periods.pm },
  ];
  return (
    <fieldset
      aria-label={ariaLabel}
      className="flex w-14 flex-col justify-center gap-0.5 border-0 p-0 m-0 min-w-0"
    >
      {items.map((it) => {
        const on = it.key === selected;
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(it.key)}
            className={cn(
              "shrink-0 rounded-md py-1.5 text-center text-sm uppercase transition-colors",
              on
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </fieldset>
  );
}
