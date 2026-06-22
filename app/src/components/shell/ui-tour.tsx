import { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, cn } from "@houston-ai/core";

export interface UiTourStep {
  title: string;
  body: string;
  /**
   * CSS selector (queried against `document`) for the UI element to spotlight.
   * Omit for a centered "no-target" step like the closing card.
   */
  targetSelector?: string;
  /** Padding (px) around the target element for the spotlight cutout. */
  spotlightPadding?: number;
  /**
   * Side-effect to run when this step becomes active (forward or backward).
   * Use to actually open the tab/section/dialog the step talks about so the
   * user sees the destination, not just a spotlight on the trigger.
   */
  onEnter?: () => void;
  /**
   * Override automatic tooltip placement. `viewport-right`/`viewport-left`
   * pin the card to the corresponding viewport edge instead of anchoring to
   * the cutout. Useful when the cutout is huge (e.g. a modal interior) and
   * a card next to it would still cover the content.
   */
  placement?:
    | "below"
    | "above"
    | "right"
    | "left"
    | "viewport-right"
    | "viewport-left";
  /** Override the confirm button label on this step (defaults to next/done). */
  confirmLabel?: string;
}

interface UiTourProps {
  steps: UiTourStep[];
  onDismiss: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const DEFAULT_PAD = 8;
const TOOLTIP_W = 360;
const TOOLTIP_H_EST = 240;
const TOOLTIP_GAP = 16;
const VIEWPORT_MARGIN = 16;

type Placement = "below" | "above" | "right" | "left";

/**
 * Game-tutorial style coachmark overlay. Per step:
 *  - Looks up the target element by CSS selector
 *  - Cuts a transparent hole in a dark scrim around it (box-shadow trick)
 *  - Highlights the element with a subtle pulsing ring
 *  - Floats a tooltip card next to the cutout with an arrow pointing in
 *
 * Steps without a `targetSelector` render as a centered modal with no
 * spotlight (used for the closing "you're set" card).
 *
 * Re-measures on window resize so the cutout/tooltip stay glued to the
 * target as the user resizes the window.
 */
export function UiTour({ steps, onDismiss }: UiTourProps) {
  const { t } = useTranslation("shell");
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  // Re-measure target on step change + on viewport resize. useLayoutEffect so
  // the cutout/tooltip render in the right place on the same paint as the
  // step transition (avoids a 1-frame flash at the old position).
  useLayoutEffect(() => {
    step?.onEnter?.();
    if (!step?.targetSelector) {
      setRect(null);
      return;
    }
    const targetSelector = step.targetSelector;
    // The target may not be in the DOM yet if onEnter just switched views or
    // opened a dialog. Retry a few frames until it appears.
    let cancelled = false;
    let raf = 0;
    let tries = 0;
    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(targetSelector);
      if (!el) {
        if (tries++ < 30) {
          raf = window.requestAnimationFrame(measure);
        } else {
          setRect(null);
        }
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    const onResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      measure();
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [step]);

  if (!step) return null;
  const isLast = index === steps.length - 1;
  const isFirst = index === 0;

  const pad = step.spotlightPadding ?? DEFAULT_PAD;
  const cutout = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // Tooltip placement: pick a side based on the target's aspect ratio and
  // available room. Wide-and-short targets (tab bars, top header) prefer
  // below / above so the card doesn't sit on top of them. Tall targets
  // (sidebar) prefer left / right. Picks the first side with enough room,
  // falls back to whichever has the most space.
  const tooltip = (() => {
    // Viewport-anchored placements ignore the cutout entirely. Used when the
    // cutout is so big a cutout-relative card would still cover content
    // (e.g. spotlighting the interior of a near-fullscreen dialog).
    if (step.placement === "viewport-right") {
      return {
        top: Math.max(VIEWPORT_MARGIN, viewport.height / 2 - TOOLTIP_H_EST / 2),
        left: viewport.width - TOOLTIP_W - VIEWPORT_MARGIN,
      };
    }
    if (step.placement === "viewport-left") {
      return {
        top: Math.max(VIEWPORT_MARGIN, viewport.height / 2 - TOOLTIP_H_EST / 2),
        left: VIEWPORT_MARGIN,
      };
    }
    if (!cutout) {
      return {
        top: viewport.height / 2 - 140,
        left: viewport.width / 2 - TOOLTIP_W / 2,
      };
    }
    const spaceBelow =
      viewport.height - (cutout.top + cutout.height) - TOOLTIP_GAP;
    const spaceAbove = cutout.top - TOOLTIP_GAP;
    const spaceRight =
      viewport.width - (cutout.left + cutout.width) - TOOLTIP_GAP;
    const spaceLeft = cutout.left - TOOLTIP_GAP;

    const isWideShort =
      cutout.width >= viewport.width * 0.4 && cutout.height < 220;
    const order: Placement[] = isWideShort
      ? ["below", "above", "right", "left"]
      : ["right", "left", "below", "above"];
    const fits: Record<Placement, boolean> = {
      below: spaceBelow >= TOOLTIP_H_EST,
      above: spaceAbove >= TOOLTIP_H_EST,
      right: spaceRight >= TOOLTIP_W,
      left: spaceLeft >= TOOLTIP_W,
    };
    const space: Record<Placement, number> = {
      below: spaceBelow,
      above: spaceAbove,
      right: spaceRight,
      left: spaceLeft,
    };

    const anyFits = order.some((p) => fits[p]);
    // No side has room (target ≈ full viewport, e.g. the whole main pane) →
    // just center the card. Looks intentional rather than clipped.
    if (!anyFits) {
      return {
        top: Math.max(VIEWPORT_MARGIN, viewport.height / 2 - TOOLTIP_H_EST / 2),
        left: Math.max(VIEWPORT_MARGIN, viewport.width / 2 - TOOLTIP_W / 2),
      };
    }

    const placement: Placement =
      (step.placement === "below" ||
      step.placement === "above" ||
      step.placement === "right" ||
      step.placement === "left"
        ? step.placement
        : undefined) ??
      order.find((p) => fits[p]) ??
      (Object.entries(space).sort((a, b) => b[1] - a[1])[0][0] as Placement);

    const clampLeft = (x: number) =>
      Math.max(
        VIEWPORT_MARGIN,
        Math.min(x, viewport.width - TOOLTIP_W - VIEWPORT_MARGIN),
      );
    const clampTop = (y: number) =>
      Math.max(
        VIEWPORT_MARGIN,
        Math.min(y, viewport.height - TOOLTIP_H_EST - VIEWPORT_MARGIN),
      );

    switch (placement) {
      case "below":
        return {
          top: clampTop(cutout.top + cutout.height + TOOLTIP_GAP),
          left: clampLeft(cutout.left + cutout.width / 2 - TOOLTIP_W / 2),
        };
      case "above":
        return {
          top: clampTop(cutout.top - TOOLTIP_H_EST - TOOLTIP_GAP),
          left: clampLeft(cutout.left + cutout.width / 2 - TOOLTIP_W / 2),
        };
      case "right":
        return {
          top: clampTop(cutout.top),
          left: clampLeft(cutout.left + cutout.width + TOOLTIP_GAP),
        };
      case "left":
        return {
          top: clampTop(cutout.top),
          left: clampLeft(cutout.left - TOOLTIP_W - TOOLTIP_GAP),
        };
    }
  })();

  return (
    <>
      {/* Scrim. The cutout div has no background but a giant box-shadow that
          extends the dark scrim across the rest of the viewport. When there's
          no target, fall back to a full-screen scrim. */}
      {cutout ? (
        <div
          aria-hidden
          className="pointer-events-auto fixed z-[60] rounded-xl ring-2 ring-white/70 transition-[top,left,width,height] duration-200"
          style={{
            top: cutout.top,
            left: cutout.left,
            width: cutout.width,
            height: cutout.height,
            boxShadow: "0 0 0 9999px rgba(13,13,13,0.55)",
          }}
        />
      ) : (
        <div
          aria-hidden
          className="pointer-events-auto fixed inset-0 z-[60] bg-foreground/45"
        />
      )}

      {/* Pulsing accent ring on the cutout for the "look here" cue. Pure
          decoration; pointer-events disabled so it doesn't block clicks. */}
      {cutout && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[60] rounded-xl ring-2 ring-white/40 motion-safe:animate-pulse"
          style={{
            top: cutout.top - 4,
            left: cutout.left - 4,
            width: cutout.width + 8,
            height: cutout.height + 8,
          }}
        />
      )}

      {/* Tooltip card. Anchored next to the cutout, or centered when there
          is no target. */}
      <div
        className={cn(
          "fixed z-[60] rounded-2xl border border-black/5 bg-background p-5 shadow-[0_10px_40px_rgba(0,0,0,0.18)]",
        )}
        style={{
          top: tooltip.top,
          left: tooltip.left,
          width: TOOLTIP_W,
        }}
        role="dialog"
        aria-modal="true"
      >
        <p className="text-xs text-muted-foreground">
          {t("uiTour.counter", {
            current: index + 1,
            total: steps.length,
          })}
        </p>
        <h2 className="mt-2 text-[22px] font-normal leading-snug">
          {step.title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
        <div className="mt-5 flex items-center justify-between gap-2">
          {!isLast ? (
            <Button
              variant="ghost"
              className="rounded-full"
              onClick={onDismiss}
            >
              {t("uiTour.skip")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button
                variant="secondary"
                className="rounded-full"
                onClick={() => setIndex(index - 1)}
              >
                {t("uiTour.previous")}
              </Button>
            )}
            <Button
              className="rounded-full"
              onClick={() => (isLast ? onDismiss() : setIndex(index + 1))}
            >
              {step.confirmLabel ??
                (isLast ? t("uiTour.done") : t("uiTour.next"))}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
