import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import { osIsTauri } from "../../lib/os-bridge";
import { isMac } from "../../lib/platform";
import { SpaceBackground } from "./space-background";

/**
 * The shared full-screen space layout: the theme-invariant `--ht-space-canvas`
 * base, the {@link SpaceBackground} deep-space backdrop (WebGL nebula + canvas
 * starfield) as an aria-hidden layer behind everything, and a `z-10` content
 * slot that floats on top. Both the sign-in screen and the workspace-loading
 * splash render inside this so the boot experience reads as one continuous
 * space (Mercury pattern: dark backdrop, light card). Content is passed as
 * `children`; the wrapper already supplies the `relative z-10` stacking, so
 * children never need to re-declare it.
 */
export function SpaceScreen({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex h-screen flex-col bg-[var(--ht-space-canvas)] text-foreground",
        className,
      )}
    >
      <SpaceBackground />
      {/* macOS titleBarStyle: Overlay draws no native bar, so without a drag
          region the window can't be moved from these full-screen space
          surfaces (sign-in, workspace loading). Same strip as the workspace
          shell's, but floated over the top edge so the splash layouts don't
          shift; both consumers keep their content below 28px. Gated like the
          shell's: only the macOS desktop build uses the overlay title bar. */}
      {osIsTauri() && isMac && (
        <div
          data-tauri-drag-region
          className="absolute inset-x-0 top-0 z-20 h-7"
        />
      )}
      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
    </div>
  );
}
