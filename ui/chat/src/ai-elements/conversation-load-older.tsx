"use client";

import { cn } from "@houston-ai/core";
import { Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";

export type ConversationLoadOlderProps = {
  /** Older messages exist server-side (the loaded window has a start > 0). */
  hasOlder: boolean;
  /** Prepend the previous page; resolves once the feed carries it. */
  onLoadOlder: () => Promise<unknown>;
};

/**
 * Scroll-up lazy-load trigger (HOU-819). Mount as the FIRST child of
 * <ConversationContent>: when the user scrolls the top of the loaded window
 * into view, the previous transcript page is fetched and prepended, and the
 * viewport is anchored (same distance from the bottom) so the content on
 * screen never jumps. Guarded against the initial stick-to-bottom animation
 * (which sweeps the sentinel past the viewport while pinned to bottom) and
 * against overlapping loads.
 */
export const ConversationLoadOlder = ({
  hasOlder,
  onLoadOlder,
}: ConversationLoadOlderProps) => {
  const { scrollRef, isAtBottom } = useStickToBottomContext();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const isAtBottomRef = useRef(isAtBottom);
  isAtBottomRef.current = isAtBottom;

  useEffect(() => {
    const el = sentinelRef.current;
    const pane = scrollRef.current;
    if (!el || !pane || !hasOlder) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (loadingRef.current || isAtBottomRef.current) return;
        loadingRef.current = true;
        setLoading(true);
        // Anchor by distance-from-bottom: prepended content grows the pane
        // upward, so restoring that distance keeps the visible messages still.
        const bottomGap = pane.scrollHeight - pane.scrollTop;
        void onLoadOlder()
          .catch(() => {
            // The parent's loader surfaces its own failure (toast path); here
            // only the trigger state must recover so a retry can fire.
          })
          .finally(() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                pane.scrollTop = pane.scrollHeight - bottomGap;
                loadingRef.current = false;
                setLoading(false);
              });
            });
          });
      },
      { root: pane, rootMargin: "160px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasOlder, onLoadOlder, scrollRef]);

  if (!hasOlder) return null;
  return (
    <div aria-hidden className="flex justify-center py-1" ref={sentinelRef}>
      <Loader2Icon
        className={cn(
          "size-4 text-ink-muted",
          loading ? "animate-spin opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
};
