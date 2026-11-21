export type HeaderMode = "full" | "stacked";

export interface HeaderThresholds {
  oneRowMin: number;
}

export function headerMode(
  width: number | null,
  thresholds: HeaderThresholds,
): HeaderMode {
  if (width === null) return "stacked";
  return width >= thresholds.oneRowMin ? "full" : "stacked";
}

export function headerHoldsTools(mode: HeaderMode): boolean {
  return mode === "full";
}

export function headerCollapsesTabs(
  mode: HeaderMode,
  isMobile: boolean,
): boolean {
  return isMobile && mode === "stacked";
}

export const HEADER_HEIGHT = "h-12";

export const HEADER_HEIGHT_DESKTOP = "md:h-12";
