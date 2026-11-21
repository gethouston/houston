import { useEffect, useRef } from "react";
import { resolveAutoCollapse } from "../../lib/sidebar-auto-collapse";

export function useSidebarAutoCollapse(
  isMobile: boolean,
  setSidebarCollapsed: (collapsed: boolean) => void,
): void {
  const prevWidth = useRef<number | null>(null);
  useEffect(() => {
    if (isMobile) return;
    const apply = () => {
      const w = window.innerWidth;
      const decision = resolveAutoCollapse(prevWidth.current, w);
      if (decision !== null) setSidebarCollapsed(decision);
      prevWidth.current = w;
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [setSidebarCollapsed, isMobile]);
}
