import { Button, cn } from "@houston-ai/core";
import { TutorialDismissButton } from "./tutorial-dismiss-button";
import {
  CARD_W,
  placeCard,
  useSpotlightRects,
} from "./tutorial-spotlight-geometry";
import { TutorialSpotlightVeil } from "./tutorial-spotlight-veil";

/**
 * A tutorial's interactive spotlight: dims the shell behind the lesson's
 * blackish scrim but leaves a HOLE over the target that clicks
 * pass straight through — the user performs the real action on the real
 * control (game-tutorial style), instead of reading about it on a card.
 *
 * Anatomy: four transparent blocker panels around the hole own the pointer
 * events (a box-shadow is not hit-testable, so the visual scrim alone blocks
 * nothing); the tour's cutout div (rounded ring + giant veil shadow) paints the
 * dark veil without intercepting anything; a compact coach card sits beside
 * the hole and tells the user what to click and why. While the target is not
 * on screen yet (the view is still switching), the veil covers everything and
 * the card centers — the measurer keeps polling, so the hole opens the moment
 * the anchor renders.
 *
 * All the measuring and placement math lives in
 * {@link import("./tutorial-spotlight-geometry")} and everything painted around
 * the hole in {@link import("./tutorial-spotlight-veil")}; this file is the
 * coach card.
 */
export function TutorialSpotlight({
  selector,
  title,
  hint,
  aside,
  asideCta,
  onAsideCta,
  inDialog,
  showCues = true,
  onDismiss,
  dismissLabel,
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
  /** A way out, when the flow HAS one. Absent for the mandatory setup, which
   *  then renders no close at all. */
  onDismiss?: () => void;
  /** Names the close for a screen reader; the button is icon-only. */
  dismissLabel?: string;
}) {
  const { hole, dialogRect, viewport } = useSpotlightRects(selector, inDialog);
  const card = placeCard({
    hole,
    dialogRect,
    viewport,
    inDialog: inDialog === true,
  });

  // Above the z-50 dialog layer for in-dialog steps, else above shell chrome
  // (≤ z-30) but below dialogs/toasts. Both literals, for the Tailwind JIT.
  const z = inDialog ? "z-[60]" : "z-40";

  return (
    <>
      <TutorialSpotlightVeil
        hole={hole}
        dialogRect={dialogRect}
        viewport={viewport}
        inDialog={inDialog === true}
        showCues={showCues}
        z={z}
      />
      {/* The guide chip. Non-modal on purpose — the real UI is the interface.
          `pointer-events-auto` is load-bearing: while a Radix modal is open it
          sets `pointer-events: none` on <body>, which would otherwise kill
          the close button the chip carries. */}
      <div
        role="dialog"
        aria-label={title}
        className={cn(
          "ht-tutorial-card-shadow pointer-events-auto fixed flex items-center gap-3 rounded-2xl border border-ink/5 bg-input px-4 py-3 transition-[top,left] duration-200",
          z,
        )}
        style={{ top: card.top, left: card.left, width: CARD_W }}
      >
        {onDismiss && dismissLabel && (
          // Tucked into the chip's own compact corner, and the title clears
          // it below.
          <TutorialDismissButton
            label={dismissLabel}
            onDismiss={onDismiss}
            className="top-1.5 right-1.5"
          />
        )}
        <div className="min-w-0 flex-1 pl-1">
          <p
            className={cn(
              "text-[15px] font-medium leading-snug text-balance text-ink",
              onDismiss && dismissLabel && "pr-6",
            )}
          >
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
