import { breakpointPx } from "@houston/design-tokens";

/**
 * The imperative twin of `useIsMobile()` for store-free code paths (keyboard
 * shortcuts, nav bindings) that fork on the ONE responsive boundary. Same
 * token, same edge — width-based, never platform sniffing.
 */
export function isMobileViewport(): boolean {
  return (
    typeof window !== "undefined" && window.innerWidth < breakpointPx.mobile
  );
}
