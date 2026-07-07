import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
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
      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
    </div>
  );
}
