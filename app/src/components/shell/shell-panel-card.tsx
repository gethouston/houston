import { cn } from "@houston-ai/core";

/**
 * The shell's ONE detail-panel card: the portal target every panel surface
 * renders into (`useShellDetailPanel`), a sibling of `<main>` in the content
 * row. Rendered only while a surface claims the panel.
 *
 * Three shapes, one element. On the phone it covers the content area (the
 * board stays mounted underneath; its own close button returns to it). On
 * the desktop it is the 45% side card — or, when the chat is wide
 * (`usePanelWide`), it takes the row `<main>` has left.
 */
export function ShellPanelCard({
  isMobile,
  wide,
  containerRef,
}: {
  isMobile: boolean;
  wide: boolean;
  containerRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={containerRef}
      data-testid="mission-panel"
      data-wide={wide ? "true" : undefined}
      className={cn(
        "h-full overflow-hidden rounded-none bg-background canvas-screen md:rounded-2xl",
        isMobile && "absolute inset-0 z-30 w-full",
        wide && "md:min-w-0 md:flex-1",
      )}
      style={isMobile || wide ? undefined : { width: "45%", minWidth: 380 }}
    />
  );
}
