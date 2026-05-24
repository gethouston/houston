import { useEffect, useState } from "react";

/**
 * Tracks the live visual-viewport geometry and returns `{ height,
 * offsetTop, keyboardHeight }`. This is the single reliable signal
 * for "where is the user actually able to see content right now" on
 * iOS — `100dvh` alone is inconsistent across iOS versions when the
 * keyboard opens, and any manual math (dvh minus keyboardHeight)
 * risks double-subtracting because `dvh` already shrinks on some
 * builds.
 *
 * Consumers should set the chat container's `height` to `vv.height`
 * and `top` to `vv.offsetTop`. The composer then sits at the bottom
 * of the visible viewport regardless of keyboard state.
 */
export interface VisualViewportRect {
  /** Height of the visible viewport in CSS pixels. */
  height: number;
  /** Offset from the layout viewport's top — nonzero only when the
   * keyboard is open on iOS and the browser has shifted content up. */
  offsetTop: number;
  /** Derived: how much vertical space the keyboard is occupying. */
  keyboardHeight: number;
}

function snapshot(): VisualViewportRect {
  const vv = typeof window !== "undefined" ? window.visualViewport : undefined;
  if (vv) {
    return {
      height: vv.height,
      offsetTop: vv.offsetTop,
      keyboardHeight: Math.max(
        0,
        (typeof window !== "undefined" ? window.innerHeight : 0) - vv.height,
      ),
    };
  }
  return {
    height: typeof window !== "undefined" ? window.innerHeight : 0,
    offsetTop: 0,
    keyboardHeight: 0,
  };
}

export function useVisualViewport(): VisualViewportRect {
  const [rect, setRect] = useState<VisualViewportRect>(snapshot);

  useEffect(() => {
    const vv =
      typeof window !== "undefined" ? window.visualViewport : undefined;
    if (!vv) return;
    const update = () => setRect(snapshot());
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return rect;
}

/** @deprecated Prefer `useVisualViewport` — it returns `{ height,
 *  offsetTop }` which you need to correctly pin a fixed container
 *  against iOS Safari's keyboard. */
export function useKeyboardHeight(): number {
  return useVisualViewport().keyboardHeight;
}
