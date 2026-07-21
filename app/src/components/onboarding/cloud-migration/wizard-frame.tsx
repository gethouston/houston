import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";

/**
 * The shared hero layout of the cloud-migration wizard (HOU-719): a centered
 * column on the calm grey {@link FirstRunScreen} background, no card (like the
 * onboarding celebration screens), so the move-to-cloud moment reads as the
 * same continuous flow as sign-in and onboarding. Hero copy is normal ink; any
 * card content nested inside is a plain white surface. Content scrolls inside
 * the frame; the page never scrolls.
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
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10 text-ink">
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
            <p className="mb-2 text-xs font-medium text-ink-muted">{eyebrow}</p>
          )}
          <h1 className="text-balance text-[34px] font-semibold leading-tight tracking-tight">
            {title}
          </h1>
        </div>
        {body && (
          <p className="max-w-lg text-pretty text-base leading-relaxed text-ink-muted">
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
