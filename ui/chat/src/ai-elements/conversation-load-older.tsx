"use client";

import { cn } from "@houston-ai/core";
import { Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";

export type ConversationLoadOlderProps = {
  hasOlder: boolean;
  onLoadOlder: () => Promise<unknown>;
};

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
        const bottomGap = pane.scrollHeight - pane.scrollTop;
        void onLoadOlder()
          .catch(() => {})
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
