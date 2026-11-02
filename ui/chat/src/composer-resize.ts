// The composer's manual size: the user drags its top edge to make the message
// box taller than auto-grow would. DOM-free so node:test can pin the maths.

/** The textarea's auto-grow cap, its `max-h-52`. */
export const COMPOSER_AUTO_MAX_PX = 208;
/** Dragged below this (about two lines), the manual size lets go and the box
 *  is back to auto-grow. */
export const COMPOSER_MANUAL_MIN_PX = 48;
/** Viewport height kept free above a dragged composer: the chat header, a
 *  strip of conversation, and the composer's own padding and controls. */
export const COMPOSER_CHROME_RESERVE_PX = 240;
/** One arrow-key press on the focused handle. */
export const COMPOSER_RESIZE_STEP_PX = 24;

/** The tallest the textarea may be dragged in a viewport this tall. Never below
 *  the auto cap, so a short window still allows what auto-grow does. */
export function composerHeightLimit(viewportPx: number): number {
  return Math.max(
    COMPOSER_AUTO_MAX_PX,
    viewportPx - COMPOSER_CHROME_RESERVE_PX,
  );
}

/** A requested drag height as the manual size to keep: whole pixels, capped by
 *  the viewport, or null (auto) once it drops under the minimum. */
export function clampComposerHeight(
  px: number,
  viewportPx: number,
): number | null {
  if (px < COMPOSER_MANUAL_MIN_PX) return null;
  return Math.min(Math.round(px), composerHeightLimit(viewportPx));
}

/** The textarea's fit bounds. Auto: grow from one line to the auto cap. Manual:
 *  the dragged size is a floor (the box stays that tall even when empty), and
 *  the cap is the larger of it and the auto cap, so text past a small manual
 *  size still grows the box the way it always did. Re-clamped against the
 *  current viewport, so shrinking the window shrinks a tall composer. */
export function composerTextareaBounds(
  manualPx: number | null,
  viewportPx: number,
): { minPx: number; maxPx: number } {
  if (manualPx === null) return { minPx: 0, maxPx: COMPOSER_AUTO_MAX_PX };
  const floor = Math.min(manualPx, composerHeightLimit(viewportPx));
  return { minPx: floor, maxPx: Math.max(floor, COMPOSER_AUTO_MAX_PX) };
}
