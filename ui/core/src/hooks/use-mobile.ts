"use client";

import { breakpointPx } from "@houston/design-tokens";
import * as React from "react";

const MOBILE_BREAKPOINT = breakpointPx.mobile;

/**
 * The same edge, read synchronously. For one-shot decisions made inside an
 * effect or handler (e.g. "would focusing this input raise a phone keyboard
 * right now?") where the hook's post-mount state would still read `false` on
 * the very render that decides.
 */
export function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
