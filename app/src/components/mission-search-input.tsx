import { useLayoutEffect, useRef, useState } from "react";
import { Input } from "@houston-ai/core";
import { Loader2, Search, X } from "lucide-react";

interface MissionSearchInputLabels {
  placeholder: string;
  /** Shown only when the input is too narrow to fit `placeholder` without
   *  clipping (e.g. "Search..."). Omit to always show `placeholder`. */
  placeholderShort?: string;
  clear: string;
  searchingText: string;
}

interface MissionSearchInputProps {
  value: string;
  isSearchingText: boolean;
  labels: MissionSearchInputLabels;
  className?: string;
  onChange: (value: string) => void;
}

// Reused offscreen canvas for measuring placeholder text width.
let measureCanvas: HTMLCanvasElement | null = null;
function textWidth(text: string, font: string): number {
  measureCanvas ??= document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return 0;
  ctx.font = font;
  return ctx.measureText(text).width;
}

export function MissionSearchInput({
  value,
  isSearchingText,
  labels,
  className,
  onChange,
}: MissionSearchInputProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Visible placeholder: the full text, or the short one when it wouldn't fit.
  const [placeholder, setPlaceholder] = useState(labels.placeholder);
  const { placeholder: full, placeholderShort } = labels;

  // Layout effect (not useEffect) so the first measurement happens before paint
  // — avoids a full→short flicker on mount when the input is already narrow.
  useLayoutEffect(() => {
    const el = wrapperRef.current?.querySelector("input");
    if (!el || !placeholderShort) {
      setPlaceholder(full);
      return;
    }
    const update = () => {
      const cs = getComputedStyle(el);
      const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const available = Math.max(
        0,
        el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0),
      );
      // +4px so it switches just before the text would actually clip.
      setPlaceholder(textWidth(full, font) + 4 <= available ? full : placeholderShort);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [full, placeholderShort]);

  return (
    <div ref={wrapperRef} className={className ?? "relative"}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        role="searchbox"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={full}
        autoComplete="off"
        className="rounded-full border-border bg-background pl-9 pr-16 text-sm focus:bg-background"
      />
      {isSearchingText && (
        <Loader2
          className="pointer-events-none absolute right-9 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-label={labels.searchingText}
        />
      )}
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={labels.clear}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
