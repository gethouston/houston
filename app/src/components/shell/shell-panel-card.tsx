import { cn } from "@houston-ai/core";

/**
 * The shell's ONE detail-panel card: the portal target every panel surface
 * renders into (`useShellDetailPanel`), a sibling of `<main>` in the content
 * row. Rendered only while a surface claims the panel.
 *
 * Three shapes, one element, all in CSS. The phone layer (unprefixed) covers
 * the content area (the board stays mounted underneath; the panel's own close
 * button returns to it). The desktop layer (`md:`) is the 45% side card — or,
 * when the chat is wide (`usePanelWide`), it takes the row `<main>` has left.
 */
export function ShellPanelCard({
  wide,
  containerRef,
}: {
  wide: boolean;
  containerRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={containerRef}
      data-testid="mission-panel"
      data-wide={wide ? "true" : undefined}
      className={cn(
        "absolute inset-0 z-30 h-full w-full overflow-hidden rounded-none bg-background canvas-screen",
        "md:static md:inset-auto md:z-auto md:rounded-2xl",
        wide ? "md:w-auto md:min-w-0 md:flex-1" : "md:w-[45%] md:min-w-[380px]",
      )}
    />
  );
}
