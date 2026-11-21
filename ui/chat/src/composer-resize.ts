export const COMPOSER_AUTO_MAX_PX = 208;
export const COMPOSER_MANUAL_MIN_PX = 48;
export const COMPOSER_CHROME_RESERVE_PX = 240;
export const COMPOSER_RESIZE_STEP_PX = 24;

export function composerHeightLimit(viewportPx: number): number {
  return Math.max(
    COMPOSER_AUTO_MAX_PX,
    viewportPx - COMPOSER_CHROME_RESERVE_PX,
  );
}

export function clampComposerHeight(
  px: number,
  viewportPx: number,
): number | null {
  if (px < COMPOSER_MANUAL_MIN_PX) return null;
  return Math.min(Math.round(px), composerHeightLimit(viewportPx));
}

export function composerTextareaBounds(
  manualPx: number | null,
  viewportPx: number,
): { minPx: number; maxPx: number } {
  if (manualPx === null) return { minPx: 0, maxPx: COMPOSER_AUTO_MAX_PX };
  const floor = Math.min(manualPx, composerHeightLimit(viewportPx));
  return { minPx: floor, maxPx: Math.max(floor, COMPOSER_AUTO_MAX_PX) };
}
