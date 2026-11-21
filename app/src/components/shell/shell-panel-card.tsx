import { cn } from "@houston-ai/core";
import { tourAnchor } from "./workspace-tour-steps.ts";

export function ShellPanelCard({
  wide,
  stepsOut,
  containerRef,
}: {
  wide: boolean;
  stepsOut: boolean;
  containerRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={containerRef}
      {...tourAnchor("taskChat")}
      data-testid="mission-panel"
      data-wide={wide ? "true" : undefined}
      className={cn(
        "absolute inset-0 z-30 h-full w-full overflow-hidden rounded-none bg-background canvas-screen",
        "md:static md:inset-auto md:z-auto md:rounded-2xl",
        wide ? "md:w-auto md:min-w-0 md:flex-1" : "md:w-[45%] md:min-w-[380px]",
        stepsOut && "md:hidden",
      )}
    />
  );
}
