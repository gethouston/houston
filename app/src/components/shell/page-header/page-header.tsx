import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import { BackControl, type BackTarget } from "../back-control";
import { HEADER_HEIGHT, headerHoldsTools } from "./page-header-layout";
import { usePageHeaderMode, usePageHeaderSlotRef } from "./page-header-tools";

/**
 * The frame owns geometry only; callers choose tabs or a switcher.
 *
 * ONE home at every width: the strip inside the screen card, phone included.
 *
 * A page that sits one level below something else passes `back`: the shared
 * {@link BackControl} leads the strip, before the identity cluster, so a
 * drilled page wears ONE top row — back, identity, tools — instead of stacking
 * a back bar above its own header. The 40px phone chip stands inside the
 * strip's 48px, so the frame's height is the same with it or without it.
 */
export function PageHeader({
  back,
  children,
}: {
  back?: BackTarget;
  children: ReactNode;
}) {
  const mode = usePageHeaderMode();
  const stripRef = usePageHeaderSlotRef("strip");
  const toolsRef = usePageHeaderSlotRef("tools");
  const holdsTools = headerHoldsTools(mode);

  return (
    <div
      ref={stripRef}
      data-testid="page-header"
      className={cn(HEADER_HEIGHT, "flex shrink-0 items-center gap-3 px-5")}
    >
      {back && <BackControl label={back.label} onClick={back.onClick} />}
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
