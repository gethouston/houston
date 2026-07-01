import { cn } from "@houston-ai/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { PickerTab } from "./new-mission-picker-tab-model";

interface ScrollableTabsProps {
  tabs: PickerTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  scrollLeftLabel: string;
  scrollRightLabel: string;
}

/**
 * Horizontal pill-tab list with subtle chevron arrows when overflow exists.
 * Arrows fade in/out based on scroll position; native horizontal scroll is
 * preserved for trackpad users but the visible scrollbar is hidden.
 */
export function ScrollableTabs({
  tabs,
  activeTab,
  onTabChange,
  scrollLeftLabel,
  scrollRightLabel,
}: ScrollableTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useLayoutEffect(() => {
    measure();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: dir * Math.max(120, el.clientWidth * 0.6),
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(
      `[data-tab-id="${activeTab}"]`,
    );
    active?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [activeTab]);

  return (
    <div className="shrink-0 relative px-6 pb-3">
      <div
        ref={scrollRef}
        onScroll={measure}
        className="flex gap-1 overflow-x-auto scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-tab-id={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "px-3 py-1.5 text-sm rounded-full transition-colors whitespace-nowrap",
              activeTab === tab.id
                ? "bg-accent text-foreground font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {canLeft && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          aria-label={scrollLeftLabel}
          className="absolute left-2 top-1/2 -translate-y-1/2 size-6 rounded-full bg-background/90 border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors -mt-1.5"
        >
          <ChevronLeft className="size-3.5" />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          aria-label={scrollRightLabel}
          className="absolute right-2 top-1/2 -translate-y-1/2 size-6 rounded-full bg-background/90 border border-border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors -mt-1.5"
        >
          <ChevronRight className="size-3.5" />
        </button>
      )}
    </div>
  );
}
