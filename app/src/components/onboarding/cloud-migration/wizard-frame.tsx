import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import { SPACE_CARD_VARS } from "../setup-card";

/**
 * The shared hero layout of the cloud-migration wizard (HOU-719): a centered
 * column floating DIRECTLY on the shared `SpaceScreen` backdrop (the landing
 * page's Milky Way photograph), no card, like the workspace-loading splash,
 * so the move-to-cloud moment reads as the same continuous space as sign-in
 * and onboarding. Pins the dark palette + the space-card token remap so
 * interactive content inside (buttons, chips, rows) reads on the photo.
 * Content scrolls inside the frame; the page itself never scrolls.
 */
export function WizardFrame({
  mark,
  badge,
  eyebrow,
  title,
  body,
  children,
  footer,
  wide,
}: {
  /** Centerpiece above everything (logo, loader, success mark). */
  mark?: ReactNode;
  /** A pill/badge above the title (e.g. the beta early-access badge). */
  badge?: ReactNode;
  /** Small sentence-case line above the title (e.g. "Step 1 of 2"). */
  eyebrow?: string;
  title: string;
  body?: string;
  children?: ReactNode;
  /** Pinned under the scrollable content (primary/secondary actions). */
  footer?: ReactNode;
  /** Widen the column for content-rich screens. */
  wide?: boolean;
}) {
  return (
    <div
      data-theme="dark"
      style={SPACE_CARD_VARS}
      className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10 text-[var(--ht-space-foreground)]"
    >
      {/* Local text-protection veil: the hero column sits right over the
          photo's bright galactic core (center 42%), so a soft radial pool of
          canvas darkness backs the copy without dimming the whole photo. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 48% at 50% 50%, color-mix(in srgb, var(--ht-space-canvas) 78%, transparent) 0%, color-mix(in srgb, var(--ht-space-canvas) 55%, transparent) 55%, transparent 78%)",
        }}
      />
      <div
        className={cn(
          "relative z-10 flex min-h-0 w-full flex-col items-center gap-6 text-center",
          wide ? "max-w-[820px]" : "max-w-xl",
        )}
      >
        {mark}
        {badge}
        <div>
          {eyebrow && (
            <p className="mb-2 text-xs font-medium text-[var(--ht-space-foreground-muted)]">
              {eyebrow}
            </p>
          )}
          <h1 className="text-balance text-[34px] font-semibold leading-tight tracking-tight">
            {title}
          </h1>
        </div>
        {body && (
          // Colour is inline because `text-base` is ALSO a colour utility in
          // this theme (`--color-base` exists), and it outranks an arbitrary
          // `text-[var(...)]` class in the generated utility order.
          <p
            className="max-w-lg text-pretty text-base leading-relaxed opacity-85"
            style={{ color: "var(--ht-space-foreground)" }}
          >
            {body}
          </p>
        )}
        {children && (
          <div className="min-h-0 w-full flex-1 overflow-y-auto">
            {children}
          </div>
        )}
        {footer && (
          <div className="flex w-full flex-col items-center gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
