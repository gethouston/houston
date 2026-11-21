import { useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";

export function useConversationScrollAnimation(): "smooth" | "instant" {
  return useReducedMotion() ? "instant" : "smooth";
}

export function ConversationViewportPin() {
  const { scrollRef, state } = useStickToBottomContext();

  useEffect(() => {
    const pane = scrollRef.current;
    if (!pane) return;
    let previous = pane.clientHeight;
    const observer = new ResizeObserver(() => {
      const height = pane.clientHeight;
      const difference = height - previous;
      previous = height;
      if (difference === 0 || !state.isAtBottom) return;
      state.resizeDifference = difference;
      if (difference > 0) {
        if (state.scrollTop >= state.targetScrollTop)
          state.scrollTop = state.targetScrollTop;
      } else {
        state.scrollTop -= difference;
      }
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (state.resizeDifference === difference) state.resizeDifference = 0;
        }, 1);
      });
    });
    observer.observe(pane);
    return () => observer.disconnect();
  }, [scrollRef, state]);

  return null;
}
