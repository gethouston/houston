export const SIDEBAR_AUTO_COLLAPSE_WIDTH = 1000;

export function resolveAutoCollapse(
  prevWidth: number | null,
  width: number,
  threshold: number = SIDEBAR_AUTO_COLLAPSE_WIDTH,
): boolean | null {
  const wasWideOrUnknown = prevWidth === null || prevWidth >= threshold;
  if (wasWideOrUnknown && width < threshold) return true;
  if (prevWidth !== null && prevWidth < threshold && width >= threshold) {
    return false;
  }
  return null;
}
