import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import { BackControl, type BackTarget } from "../back-control";
import { HEADER_HEIGHT, headerHoldsTools } from "./page-header-layout";
import { usePageHeaderMode, usePageHeaderSlotRef } from "./page-header-tools";

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
      <div
        ref={toolsRef}
        className={holdsTools ? "ml-auto flex items-center gap-2" : "hidden"}
      />
    </div>
  );
}
