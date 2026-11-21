import { breakpointPx } from "@houston/design-tokens";

export function isMobileViewport(): boolean {
  return (
    typeof window !== "undefined" && window.innerWidth < breakpointPx.mobile
  );
}
