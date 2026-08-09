import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import { HEADER_HEIGHT, headerHoldsTools } from "./page-header-layout";
import { usePageHeaderMode, usePageHeaderSlotRef } from "./page-header-tools";

/** The frame owns geometry only; callers choose tabs or a switcher. */
export function PageHeader({ children }: { children: ReactNode }) {
  const mode = usePageHeaderMode();
  const stripRef = usePageHeaderSlotRef("strip");
  const toolsRef = usePageHeaderSlotRef("tools");
  const holdsTools = headerHoldsTools(mode);

  return (
    <div
      ref={stripRef}
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
