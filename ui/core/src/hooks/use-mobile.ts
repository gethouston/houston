"use client";

import { breakpointPx } from "@houston/design-tokens";
import * as React from "react";

/* The ONE responsive boundary (below = phone, at/above = desktop), from the
   breakpoint token so this hook and the Tailwind `md:` edge can never drift
   (see ui/core/tests/breakpoint-sync.test.ts). */
const MOBILE_BREAKPOINT = breakpointPx.mobile;

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
