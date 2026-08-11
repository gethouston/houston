import { Button, cn } from "@houston-ai/core";
import { MousePointerClick } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * The in-app onboarding's interactive spotlight: dims the shell behind the
 * guided tour's blackish scrim but leaves a HOLE over the target that clicks
 * pass straight through — the user performs the real action on the real
 * control (game-tutorial style), instead of reading about it on a card.
 *
 * Anatomy: four transparent blocker panels around the hole own the pointer
 * events (a box-shadow is not hit-testable, so the visual scrim alone blocks
 * nothing); the tour's cutout div (rounded ring + 9999px shadow) paints the
 * dark veil without intercepting anything; a compact coach card sits beside
 * the hole and tells the user what to click and why. While the target is not
 * on screen yet (the view is still switching), the veil covers everything and
 * the card centers — the measurer keeps polling, so the hole opens the moment
 * the anchor renders.
 */

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Placement {
  top: number;
  left: number;
}

/** Padding between the target and the hole's edge. */
const PAD = 6;
const CARD_W = 300;
/** Estimated chip height for placement math (covers the aside variant). */
const CARD_H = 112;
const GAP = 16;
const MARGIN = 16;

const clamp = (min: number, v: number, max: number) =>
  Math.max(min, Math.min(v, max));

/** Beside the rect when a side fits (right → left → below → above), else null. */
function placeBeside(rect: Rect, vw: number, vh: number): Placement | null {
  const clampTop = (y: number) => clamp(MARGIN, y, vh - CARD_H - MARGIN);
  const clampLeft = (x: number) => clamp(MARGIN, x, vw - CARD_W - MARGIN);
  const right = rect.left + rect.width + GAP;
  if (right + CARD_W + MARGIN <= vw)
    return { top: clampTop(rect.top), left: right };
  if (rect.left - GAP - CARD_W >= MARGIN)
    return { top: clampTop(rect.top), left: rect.left - GAP - CARD_W };
  const centeredLeft = clampLeft(rect.left + rect.width / 2 - CARD_W / 2);
  const below = rect.top + rect.height + GAP;
  if (below + CARD_H + MARGIN <= vh) return { top: below, left: centeredLeft };
  if (rect.top - GAP - CARD_H >= MARGIN)
    return { top: rect.top - GAP - CARD_H, left: centeredLeft };
  return null;
}

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height);

export function TutorialSpotlight({
  selector,
  title,
  hint,
  aside,
  asideCta,
  onAsideCta,
  inDialog,
  showCues = true,
}: {
  /** Selector of the control the step is about. */
  selector: string;
  /** ONE short line saying WHY — clarity first, people don't read. */
  title: string;
  /** ONE short line saying WHAT to do (the action itself). */
  hint?: string;
  /** Already-done addendum: the instruction above ALWAYS stands (the step
   *  teaches where things live); this renders as a separated section under a
   *  hairline with its own skip button when the goal is already met. */
  aside?: string;
  asideCta?: string;
  onAsideCta?: () => void;
  /** The target lives INSIDE an open modal dialog: everything lifts above
   *  the z-50 dialog layer, and the blocker panels and veil stay off — the
   *  dialog's own modality (Radix focus trap + overlay) already isolates the
   *  rest of the app, and a blocker click would count as an outside-dismiss
   *  and close the dialog under the user. */
  inDialog?: boolean;
  /** The click cues (ping + cursor). Off for watch-only beats, where there
   *  is nothing to click. */
  showCues?: boolean;
}) {
  const [hole, setHole] = useState<Rect | null>(null);
  // In-dialog steps also track the open dialog's own bounds: the veil cuts
  // around the WHOLE modal and the chip is placed beside it, so the coaching
  // never covers the modal's content.
  const [dialogRect, setDialogRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  });

  // Poll + resize: the target can appear/move at any time (view switches,
  // sidebar collapse, async panes), and 300ms is well under a user's aim time.
  // The equality guard keeps the steady state render-free.
  useEffect(() => {
    const toRect = (el: Element | null, pad: number): Rect | null => {
      const r = el?.getBoundingClientRect();
      return r && r.width > 0
        ? {
            top: r.top - pad,
            left: r.left - pad,
            width: r.width + pad * 2,
            height: r.height + pad * 2,
          }
        : null;
    };
    const measure = () => {
      const next = toRect(document.querySelector(selector), PAD);
      setHole((prev) => (sameRect(prev, next) ? prev : next));
      // The Radix dialog content (`data-state` excludes the coach chip, which
      // is a bare role="dialog").
      const nextDialog = inDialog
        ? toRect(
            document.querySelector('[role="dialog"][data-state="open"]'),
            0,
          )
        : null;
      setDialogRect((prev) => (sameRect(prev, nextDialog) ? prev : nextDialog));
      setViewport((prev) =>
        prev.w === window.innerWidth && prev.h === window.innerHeight
          ? prev
          : { w: window.innerWidth, h: window.innerHeight },
      );
    };
    measure();
    const id = window.setInterval(measure, 300);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [selector, inDialog]);

  // Placement preference: beside the whole modal (in-dialog), then beside
  // the target itself — for a large modal that IS the modal's own side
  // whitespace — and only then centered. Never parked on the content the
  // user must read or use.
  const card = (inDialog && dialogRect
    ? placeBeside(dialogRect, viewport.w, viewport.h)
    : null) ??
    (hole ? placeBeside(hole, viewport.w, viewport.h) : null) ?? {
      top: viewport.h / 2 - CARD_H / 2,
      left: clamp(MARGIN, viewport.w / 2 - CARD_W / 2, viewport.w - CARD_W),
    };

  // The blocker panels around the hole (everything, while there is no hole).
  const panels: Rect[] = hole
    ? [
        { top: 0, left: 0, width: viewport.w, height: hole.top },
        {
          top: hole.top + hole.height,
          left: 0,
          width: viewport.w,
          height: Math.max(0, viewport.h - hole.top - hole.height),
        },
        { top: hole.top, left: 0, width: hole.left, height: hole.height },
        {
          top: hole.top,
          left: hole.left + hole.width,
          width: Math.max(0, viewport.w - hole.left - hole.width),
          height: hole.height,
        },
      ]
    : [{ top: 0, left: 0, width: viewport.w, height: viewport.h }];

  // Above the z-50 dialog layer for in-dialog steps, else above shell chrome
  // (≤ z-30) but below dialogs/toasts. Both literals, for the Tailwind JIT.
  const z = inDialog ? "z-[60]" : "z-40";

  return (
    <>
      {!inDialog &&
        panels.map((p, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed 4-panel geometry, no reordering
            key={i}
            aria-hidden
            className="pointer-events-auto fixed z-40"
            style={p}
          />
        ))}
      {/* The visual veil: the tour's cutout (ring + giant shadow), or a plain
          full scrim while the target is off screen. Never intercepts clicks —
          the hole must stay truly open. In-dialog steps cut around the WHOLE
          modal instead (rendered above the dialog layer), so the step reads
          exactly like every other one: dark world, lit surface. */}
      {inDialog ? (
        dialogRect && (
          <div
            aria-hidden
            className="pointer-events-none fixed z-[60] rounded-2xl transition-[top,left,width,height] duration-200"
            style={{
              ...dialogRect,
              boxShadow: "0 0 0 9999px rgba(13,13,13,0.35)",
            }}
          />
        )
      ) : hole ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-40 rounded-xl ring-2 ring-white/70 transition-[top,left,width,height] duration-200"
          style={{ ...hole, boxShadow: "0 0 0 9999px rgba(13,13,13,0.35)" }}
        />
      ) : (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-40 bg-black/35"
        />
      )}
      {/* In-dialog, the steady ring marks the inner target (the veil above
          rings nothing — it cuts around the modal). */}
      {inDialog && hole && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[60] rounded-xl ring-2 ring-white/70 transition-[top,left,width,height] duration-200"
          style={hole}
        />
      )}
      {/* The click cues: a sonar ping radiating off the ring, and a cursor
          glyph tapping at the corner — "here, CLICK". Pure decoration. */}
      {hole && showCues && (
        <>
          <div
            aria-hidden
            className={cn(
              "ht-tutorial-ping pointer-events-none fixed rounded-xl ring-2 ring-white/70",
              z,
            )}
            style={hole}
          />
          <MousePointerClick
            aria-hidden
            className={cn(
              "ht-tutorial-cursor pointer-events-none fixed h-6 w-6 text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]",
              z,
            )}
            style={{
              top: hole.top + hole.height - 10,
              left: hole.left + hole.width - 10,
            }}
          />
        </>
      )}
      {/* The guide chip. Non-modal on purpose — the real UI is the interface.
          `pointer-events-auto` is load-bearing: while a Radix modal is open it
          sets `pointer-events: none` on <body>, which would otherwise kill
          the exit button. */}
      <div
        role="dialog"
        aria-label={title}
        className={cn(
          "pointer-events-auto fixed flex items-center gap-3 rounded-2xl border border-ink/5 bg-input px-4 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.18)] transition-[top,left] duration-200",
          z,
        )}
        style={{ top: card.top, left: card.left, width: CARD_W }}
      >
        <div className="min-w-0 flex-1 pl-1">
          <p className="text-[15px] font-medium leading-snug text-balance text-ink">
            {title}
          </p>
          {hint && (
            <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">
              {hint}
            </p>
          )}
          {aside && (
            <div className="mt-3 border-t border-line pt-2.5">
              <p className="text-[13px] leading-snug text-ink-muted">{aside}</p>
              {asideCta && onAsideCta && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2 rounded-full active:scale-[0.96]"
                  onClick={onAsideCta}
                >
                  {asideCta}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
