import { cn, useIsMobile } from "@houston-ai/core";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsActiveView } from "../keep-alive-views";
import { useMobileHeaderSlot } from "../mobile-header-slot";
import {
  HEADER_HEIGHT,
  headerHoldsTools,
  headerHome,
} from "./page-header-layout";
import { usePageHeaderMode, usePageHeaderSlotRef } from "./page-header-tools";

/**
 * The frame owns geometry only; callers choose tabs or a switcher.
 *
 * Below the breakpoint the frame gives its row up: the active screen's cluster
 * portals into the phone top bar's title slot (`headerHome`), and nothing is
 * left behind in the screen card. With no strip mounted the tools provider
 * measures nothing and answers `stacked`, which is the phone form anyway.
 */
export function PageHeader({ children }: { children: ReactNode }) {
  const mode = usePageHeaderMode();
  const stripRef = usePageHeaderSlotRef("strip");
  const toolsRef = usePageHeaderSlotRef("tools");
  const holdsTools = headerHoldsTools(mode);
  const isMobile = useIsMobile();
  const isActive = useIsActiveView();
  const slot = useMobileHeaderSlot();
  const home = headerHome({ isMobile, isActive, slotMounted: slot !== null });

  if (home === "top-bar" && slot) {
    return createPortal(
      <div
        data-testid="page-header"
        className="flex min-w-0 w-full items-center overflow-x-auto [scrollbar-width:none]"
      >
        {children}
      </div>,
      slot,
    );
  }

  return (
    <div
      ref={stripRef}
      data-testid="page-header"
      className={cn(HEADER_HEIGHT, "flex shrink-0 items-center gap-3 px-5")}
    >
      <div className="flex min-w-0 items-center overflow-x-auto">
        {children}
      </div>
      {/* Rendered in BOTH forms so the portal target never changes identity:
          crossing the breakpoint must not remount or blur its search field. */}
      <div
        ref={toolsRef}
        className={holdsTools ? "ml-auto flex items-center gap-2" : "hidden"}
      />
    </div>
  );
}
