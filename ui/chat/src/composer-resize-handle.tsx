"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  COMPOSER_MANUAL_MIN_PX,
  COMPOSER_RESIZE_STEP_PX,
  clampComposerHeight,
  composerHeightLimit,
} from "./composer-resize";

export const DEFAULT_COMPOSER_RESIZE_LABEL = "Resize message box";

/**
 * The grabber on the composer's top edge (desktop only): drag it up to make the
 * message box taller, down to shrink it back; a double-click returns it to
 * auto-grow. Focused, the arrow keys do the same in steps. It sits absolutely
 * in the surface's top padding, so the composer's grid never makes room for
 * it. `height` is the manual size (null = auto); the caller owns it.
 */
export function ComposerResizeHandle({
  height,
  onResize,
  label = DEFAULT_COMPOSER_RESIZE_LABEL,
}: {
  height: number | null;
  onResize: (height: number | null) => void;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState(0);

  useLayoutEffect(() => {
    const textarea = ref.current
      ?.closest("[data-composer-surface]")
      ?.querySelector("textarea");
    if (!textarea) return;
    const measure = () =>
      setMeasuredHeight(textarea.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, []);

  // Starts from the box as drawn, so a drag from auto-grow does not jump.
  const currentHeight = (): number => {
    const textarea = ref.current
      ?.closest("[data-composer-surface]")
      ?.querySelector("textarea");
    return textarea?.getBoundingClientRect().height ?? height ?? 0;
  };

  const resizeTo = (px: number) =>
    onResize(clampComposerHeight(px, window.innerHeight));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startHeight: currentHeight() };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    resizeTo(start.startHeight + start.startY - e.clientY);
  };

  const endDrag = () => {
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === "ArrowUp"
        ? COMPOSER_RESIZE_STEP_PX
        : e.key === "ArrowDown"
          ? -COMPOSER_RESIZE_STEP_PX
          : 0;
    if (step === 0) return;
    // The surface turns Enter/Space into "focus the textarea"; arrows must
    // not leak to it either.
    e.preventDefault();
    e.stopPropagation();
    const start =
      step > 0
        ? Math.max(currentHeight(), COMPOSER_MANUAL_MIN_PX)
        : currentHeight();
    resizeTo(start + step);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable splitter is role="separator" with a value (ARIA window splitter); <hr> cannot take focus or pointer drags.
    <div
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemax={composerHeightLimit(
        typeof window === "undefined" ? 0 : window.innerHeight,
      )}
      aria-valuemin={Math.min(COMPOSER_MANUAL_MIN_PX, height ?? measuredHeight)}
      aria-valuenow={height ?? measuredHeight}
      className="group/resize absolute inset-x-0 top-0 z-10 hidden h-3 cursor-ns-resize touch-none justify-center outline-none md:flex"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={() => onResize(null)}
      onKeyDown={onKeyDown}
      onLostPointerCapture={endDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      ref={ref}
      role="separator"
      tabIndex={0}
    >
      <span
        aria-hidden="true"
        className="mt-1 h-1 w-8 rounded-full bg-ink-muted/30 transition-colors group-hover/resize:bg-ink-muted/60 group-focus-visible/resize:bg-ink-muted"
      />
    </div>
  );
}
