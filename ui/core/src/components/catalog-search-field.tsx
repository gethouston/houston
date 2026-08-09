// biome-ignore-all lint/a11y/noRedundantRoles: the explicit searchbox role is a cross-surface selector contract.

"use client";

import { Loader2, Search } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "../utils";
import { SearchClearButton } from "./search-clear-button";

let measureCanvas: HTMLCanvasElement | null = null;
function textWidth(text: string, font: string): number {
  measureCanvas ??= document.createElement("canvas");
  const context = measureCanvas.getContext("2d");
  if (!context) return 0;
  context.font = font;
  return context.measureText(text).width;
}

/** The rounded catalog search field. `label` is both its full placeholder and
 * accessible name, so consumers pass localized copy. */
export function CatalogSearchField({
  value,
  onChange,
  label,
  labelShort,
  clearLabel = "Clear search",
  busy = false,
  busyLabel = "Searching",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  labelShort?: string;
  clearLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  className?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Visible placeholder: the full text, or the short one when it wouldn't fit.
  const [placeholder, setPlaceholder] = useState(label);

  // Layout effect (not useEffect) so the first measurement happens before paint
  // — avoids a full→short flicker on mount when the input is already narrow.
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input || !labelShort) {
      setPlaceholder(label);
      return;
    }
    const update = () => {
      const style = getComputedStyle(input);
      const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const available = Math.max(
        0,
        input.clientWidth -
          (parseFloat(style.paddingLeft) || 0) -
          (parseFloat(style.paddingRight) || 0),
      );
      // +4px so it switches just before the text would actually clip.
      setPlaceholder(
        textWidth(label, font) + 4 <= available ? label : labelShort,
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(input);
    return () => observer.disconnect();
  }, [label, labelShort]);

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
      <input
        ref={inputRef}
        type="search"
        role="searchbox"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        className={cn(
          "h-9 w-full rounded-full border border-line-input bg-input pl-10 text-ink text-sm placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-focus/20 [&::-webkit-search-cancel-button]:hidden",
          busy ? "pr-14" : "pr-9",
        )}
      />
      {busy && (
        <Loader2
          className={cn(
            "pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-muted",
            value ? "right-8" : "right-3",
          )}
          aria-label={busyLabel}
        />
      )}
      {value && (
        <SearchClearButton
          label={clearLabel}
          onClear={() => {
            onChange("");
            inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}
