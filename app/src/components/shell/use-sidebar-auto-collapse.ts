import { useEffect, useRef } from "react";
import { resolveAutoCollapse } from "../../lib/sidebar-auto-collapse";

/**
 * Auto-collapse the rail when the window gets narrow (e.g. Houston docked to
 * half the screen). Acts only when crossing the threshold, so a manual toggle
 * is otherwise respected; auto-expands again when it widens back across it.
 *
 * The threshold arithmetic itself is pure and lives in
 * `lib/sidebar-auto-collapse.ts`; this hook is only the window listener that
 * feeds it and the store write that acts on its answer.
 */
export function useSidebarAutoCollapse(
  isMobile: boolean,
  setSidebarCollapsed: (collapsed: boolean) => void,
): void {
  const prevWidth = useRef<number | null>(null);
  useEffect(() => {
    // Mobile has no rail to auto-collapse; the drawer is always expanded.
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
