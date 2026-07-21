import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import { osIsTauri } from "../../lib/os-bridge";
import { isMac } from "../../lib/platform";

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
 * top; children never need to re-declare the stacking.
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
        "relative flex h-screen flex-col bg-gutter text-ink",
        className,
      )}
    >
      {/* macOS titleBarStyle: Overlay draws no native bar, so without a drag
          region the window can't be moved from these full-screen surfaces. Same
          strip as the workspace shell's, floated over the top edge so the
          layouts don't shift; consumers keep their content below 28px. Gated
          like the shell's: only the macOS desktop build uses the overlay bar. */}
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
