import { cn } from "@houston-ai/core";
import { UpdateChecker } from "./update-checker";

/**
 * The strip above the content row.
 *
 * Seamless title bar (macOS titleBarStyle: Overlay). The strip is
 * transparent, so it's the window-background colour in both themes — the
 * traffic lights float over the app's own background with no separate native
 * bar. Draggable so the window still moves by it. Only the macOS desktop
 * build uses the overlay title bar, so the strip is gated to that — on web
 * and other platforms it would just be a dead gap.
 *
 * The strip is also where the restart pill lands (`UpdateChecker`): a pill
 * floated over the corner covers whatever control sits there (the board's
 * New task, the phone's new-agent button), so instead the strip makes room
 * for it, growing to fit when a release is waiting. On platforms without the
 * title strip it exists only while the pill is up. The drag region only
 * reacts to a press on the strip itself, so the pill inside it still takes
 * the click.
 */
export function ShellTitleStrip({
  overlayTitleBar,
}: {
  overlayTitleBar: boolean;
}) {
  return (
    <div
      data-tauri-drag-region={overlayTitleBar ? true : undefined}
      className={cn(
        "flex shrink-0 items-center justify-end",
        overlayTitleBar && "min-h-7",
      )}
    >
      <UpdateChecker />
    </div>
  );
}
