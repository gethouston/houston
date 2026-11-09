import { type RefObject, useEffect, useRef } from "react";
import { toBox } from "./geometry";
import {
  clearTextSelection,
  isOnText,
  pageOf,
  readTextSelection,
} from "./text-selection";
import type { PdfAnchor, PdfBox } from "./types";

export interface PageHit {
  page: number;
  el: HTMLElement;
  anchor: PdfAnchor;
}

interface Options {
  enabled: boolean;
  /** A finished text selection or drawn area. */
  onSelect: (hit: PageHit) => void;
  /** The area being drawn, live, or null when the drag ends. */
  onDraft: (draft: { page: number; box: PdfBox } | null) => void;
  /** Touch only: the native text selection the handles currently hold. */
  onTouchText: (hit: PageHit | null) => void;
  /** A new gesture started: drop whatever selection was pending. */
  onStart: () => void;
}

const MIN_DRAG = 12;
const LONG_PRESS_MS = 380;
const TOUCH_SLOP = 8;

/**
 * Selection with no mode switch. With a mouse or pen, a drag that starts on
 * a word selects text (the browser's own selection over the text layer) and
 * one that starts anywhere else draws an area. On touch, text keeps the
 * native long-press handles, and a long press elsewhere then a drag draws an
 * area; a long press with no drag marks a default box around the finger.
 */
export function useSelectionGestures(
  container: RefObject<HTMLElement | null>,
  options: Options,
) {
  const opts = useRef(options);
  opts.current = options;

  useEffect(() => {
    const root = container.current;
    if (!root || !options.enabled) return;
    let draw: { page: number; el: HTMLElement; x0: number; y0: number } | null =
      null;
    let last = { x: 0, y: 0 };
    let textDrag = false;

    const boxOf = (tap: boolean): PdfBox | null => {
      if (!draw) return null;
      const frame = draw.el.getBoundingClientRect();
      let left = Math.min(draw.x0, last.x);
      let top = Math.min(draw.y0, last.y);
      let width = Math.abs(last.x - draw.x0);
      let height = Math.abs(last.y - draw.y0);
      if (width < MIN_DRAG || height < MIN_DRAG) {
        if (!tap) return null;
        width = frame.width * 0.28;
        height = frame.height * 0.22;
        left = draw.x0 - width / 2;
        top = draw.y0 - height / 2;
      }
      const box = toBox({ left, top, width, height }, frame);
      return box.w > 0 && box.h > 0 ? box : null;
    };
    const begin = (x: number, y: number, target: EventTarget | null) => {
      const hit = pageOf(target as Node | null);
      if (!hit) return false;
      opts.current.onStart();
      clearTextSelection();
      draw = { ...hit, x0: x, y0: y };
      last = { x, y };
      return true;
    };
    const move = (x: number, y: number) => {
      if (!draw) return;
      last = { x, y };
      const box = boxOf(false);
      opts.current.onDraft(box ? { page: draw.page, box } : null);
    };
    const end = (tap: boolean) => {
      if (!draw) return;
      const box = boxOf(tap);
      const { page, el } = draw;
      draw = null;
      opts.current.onDraft(null);
      if (box)
        opts.current.onSelect({ page, el, anchor: { kind: "area", box } });
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      if ((e.target as Element).closest?.("[data-pdf-pin]")) return;
      if (isOnText(e.target)) {
        opts.current.onStart();
        textDrag = true;
        return;
      }
      if (!begin(e.clientX, e.clientY, e.target)) return;
      e.preventDefault();
      const onMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
      const onUp = () => {
        globalThis.removeEventListener("pointermove", onMove);
        globalThis.removeEventListener("pointerup", onUp);
        end(false);
      };
      globalThis.addEventListener("pointermove", onMove);
      globalThis.addEventListener("pointerup", onUp);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!textDrag || e.pointerType === "touch") return;
      textDrag = false;
      // After the browser commits the selection the drag made.
      setTimeout(() => {
        const hit = readTextSelection(root);
        if (!hit) return;
        clearTextSelection();
        opts.current.onSelect(hit);
      }, 0);
    };

    let press: {
      timer: ReturnType<typeof setTimeout>;
      active: boolean;
    } | null = null;
    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (e.touches.length !== 1 || !touch || isOnText(e.target)) return;
      if ((e.target as Element).closest?.("[data-pdf-pin]")) return;
      const { clientX: x, clientY: y } = touch;
      const target = e.target;
      press = {
        active: false,
        timer: setTimeout(() => {
          if (!press || !begin(x, y, target)) return;
          press.active = true;
          navigator.vibrate?.(8);
        }, LONG_PRESS_MS),
      };
      last = { x, y };
    };
    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!press || !touch) return;
      if (!press.active) {
        const far =
          Math.hypot(touch.clientX - last.x, touch.clientY - last.y) >
          TOUCH_SLOP;
        if (far) {
          clearTimeout(press.timer);
          press = null;
        }
        return;
      }
      e.preventDefault();
      move(touch.clientX, touch.clientY);
    };
    const onTouchEnd = () => {
      if (!press) return;
      clearTimeout(press.timer);
      const wasActive = press.active;
      press = null;
      if (wasActive) end(true);
    };
    const onSelectionChange = () => {
      if (!matchMedia("(pointer: coarse)").matches) return;
      opts.current.onTouchText(readTextSelection(root));
    };
    const onContextMenu = (e: MouseEvent) => {
      if (!isOnText(e.target)) e.preventDefault();
    };

    root.addEventListener("pointerdown", onPointerDown);
    globalThis.addEventListener("pointerup", onPointerUp);
    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd);
    root.addEventListener("touchcancel", onTouchEnd);
    root.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      if (press) clearTimeout(press.timer);
      root.removeEventListener("pointerdown", onPointerDown);
      globalThis.removeEventListener("pointerup", onPointerUp);
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchEnd);
      root.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, [container, options.enabled]);
}
