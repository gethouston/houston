import { useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";

/** How the log moves to its latest message: the library's spring, or a jump
 *  when the person asks the system for reduced motion. */
export function useConversationScrollAnimation(): "smooth" | "instant" {
  return useReducedMotion() ? "instant" : "smooth";
}

/**
 * Keeps a log that is pinned to its latest message pinned when the log's own
 * VIEWPORT changes height: a card in the composer slot appearing, growing or
 * leaving, the composer growing a line, the phone keyboard padding the screen.
 * use-stick-to-bottom only observes its content, so without this a viewport
 * that shrinks leaves the newest lines under the composer, and one that grows
 * clamps `scrollTop` down, which the library reads as the person scrolling up
 * and answers by letting go of the bottom for good.
 *
 * A viewport change adds no content. Jump before paint because animating it
 * paints a frame with the newest lines hidden under the composer.
 *
 * A log the person scrolled up to read stays where they put it. Mount inside a
 * <Conversation>.
 */
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
      // The library ignores scroll events while `resizeDifference` is set, the
      // same guard its content observer raises, so the clamp is not an escape.
      state.resizeDifference = difference;
      state.scrollTop = state.calculatedTargetScrollTop;
      // Cleared only after the clamp's scroll event has been judged: that
      // event fires on the next frame and is weighed a timeout later.
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
