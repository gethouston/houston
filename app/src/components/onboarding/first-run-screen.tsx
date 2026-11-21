import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import { WindowDragStrip } from "../shell/window-drag-strip";

export function FirstRunScreen({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-theme="light"
      className={cn(
        "relative flex h-dvh flex-col bg-gutter text-ink",
        className,
      )}
    >
      <WindowDragStrip />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}
