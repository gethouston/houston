import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import { WindowDragStrip } from "../shell/window-drag-strip";

/**
 * The shared full-screen layout for every first-run / migration surface (the
 * language + disclaimer gates, sign-in, onboarding, and the cloud-migration
 * wizard). A flat, calm page: the app's light-mode gutter grey (`bg-gutter`, the
 * same tone the sidebar melts into) under white cards, no space photo, no glass.
 *
 * `data-theme="light"` is pinned so the first-run flow reads as a bright light
 * page even for a dark-mode user (that decision stands — the pre-workspace flow
 * is deliberately always light), and so every `--ht-*` token inside resolves to
 * its light value regardless of the app theme. A `z-10` content slot floats on
 * top; children never need to re-declare the stacking. The slot is `min-h-0`
 * so a screen taller than a short phone viewport scrolls INSIDE its card
 * instead of growing the slot past the `h-dvh` frame and off the screen.
 */
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
