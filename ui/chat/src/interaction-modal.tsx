"use client";

import { Button, cn } from "@houston-ai/core";
import { ChevronLeft, ChevronRight, XIcon } from "lucide-react";
import type { ReactNode } from "react";

/** The compact `‹ N of M ›` pager pinned top-right of the modal header. Its
 *  chevrons ARE the step navigation (Back / Forward), each disabled at its end
 *  of the sequence. A consumer passes `null` for a lone step (no pager). */
export interface InteractionModalPager {
  /** 1-based current step index (for a11y / callers that need it). */
  current: number;
  /** Total steps; the pager renders only for a multi-step sequence. */
  total: number;
  /** Precomposed progress copy, e.g. "1 of 3". */
  label: string;
  onBack: (() => void) | null;
  onForward: (() => void) | null;
  backLabel: string;
  forwardLabel: string;
}

export interface InteractionModalProps {
  /** Header title (left). A node so a question passes its text and a
   *  signin/connect step passes its `(icon) name` identity lockup. Style it with
   *  {@link InteractionModalTitle} so the whole family shares one title tone. */
  title?: ReactNode;
  /** The `‹ N of M ›` pager cluster (top-right). `null`/omitted renders none. */
  pager?: InteractionModalPager | null;
  /** Dismiss X (top-right). Omitted renders no X. */
  onDismiss?: () => void;
  dismissLabel?: string;
  /** The step content (option rows, the reason body, etc.). */
  body: ReactNode;
  /** The right-aligned footer actions row (the unified decline, plus a CTA for
   *  signin/connect). Omitted renders no footer. */
  footer?: ReactNode;
  /** Fades the body region on change so a step swap reads as "content changed,
   *  chrome stayed" (gated by the motion-safe media query). */
  contentKey?: string;
  disabled?: boolean;
}

/** The compact pager: `‹ N of M ›` with Back/Forward chevrons. */
function Pager({
  pager,
  disabled,
}: {
  pager: InteractionModalPager;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 text-ink-muted">
      <Button
        aria-label={pager.backLabel}
        className="size-6"
        disabled={disabled || !pager.onBack}
        onClick={pager.onBack ?? undefined}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="px-0.5 text-xs tabular-nums">{pager.label}</span>
      <Button
        aria-label={pager.forwardLabel}
        className="size-6"
        disabled={disabled || !pager.onForward}
        onClick={pager.onForward ?? undefined}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

/** The shared modal title, so a question, a sign-in step, and a connect step all
 *  read at the SAME weight and tone: an optional leading icon (the app/brand
 *  logo) beside REGULAR-weight foreground text (never bold — color carries the
 *  hierarchy). A question passes `text-balance` to let its text wrap; a
 *  signin/connect name passes `truncate` to keep the identity to one line. */
export function InteractionModalTitle({
  icon,
  className,
  children,
}: {
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {icon}
      {/* leading-6 makes the first text line exactly 24px — the same box as the
          pager/dismiss icon buttons (size-6) — so the header's left and right
          sides sit on one optical line even when the title wraps. */}
      <span className={cn("min-w-0 text-base text-ink leading-6", className)}>
        {children}
      </span>
    </div>
  );
}

/**
 * The shell every in-chat interaction step shares: a "Coworker card" modal with
 * a header (the step TITLE left; the `‹ N of M ›` pager + dismiss X top-right on
 * the SAME row), a body, and a right-aligned footer of card-wide actions. It
 * owns the chrome — surface, padding, header/footer row layout, and the quiet
 * body fade on a step swap — so every consumer (the question stepper, the
 * sign-in step, the connect step) is structurally identical: they differ ONLY in
 * the title, body, and footer nodes they hand in.
 *
 * How it composes with the composer is the caller's call (see ChatPanel's
 * `composerOverrideMode`): a full interaction stepper replaces the composer's
 * slot, while a lighter plan/offer floats above the still-mounted one.
 * Weight is restrained across the whole family: ONE regular step of hierarchy,
 * never competing bolds — color tone (foreground vs muted) carries the structure.
 */
export function InteractionModal({
  title,
  pager,
  onDismiss,
  dismissLabel = "Dismiss",
  body,
  footer,
  contentKey,
  disabled = false,
}: InteractionModalProps) {
  const showPager = pager != null && pager.total > 1;
  const showHeader = Boolean(title) || showPager || Boolean(onDismiss);

  return (
    <div
      aria-disabled={disabled || undefined}
      className={cn(
        // Solid `bg-input` in BOTH themes (white light / neutral.800 dark) —
        // a floating card must never bleed the content behind it through.
        "overflow-clip rounded-2xl border border-line bg-input p-5",
        "shadow-[0_1px_2px_rgba(0,0,0,0.02),0_1px_4px_rgba(0,0,0,0.03)]",
        "focus-within:shadow-[0_1px_2px_rgba(0,0,0,0.03),0_2px_6px_rgba(0,0,0,0.04)]",
        "dark:shadow-[0_1px_2px_rgba(0,0,0,0.25)]",
        "transition-shadow",
        disabled && "opacity-50",
      )}
    >
      {showHeader && (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">{title}</div>
          <div className="flex shrink-0 items-center gap-1">
            {showPager && pager && <Pager disabled={disabled} pager={pager} />}
            {onDismiss && (
              <Button
                aria-label={dismissLabel}
                className="-mr-1 shrink-0 text-ink-muted"
                disabled={disabled}
                onClick={onDismiss}
                size="icon-sm"
                variant="ghost"
              >
                <XIcon className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Content changes, chrome doesn't: a single quiet fade on step swap. */}
      <div
        className={cn(
          showHeader && "mt-3",
          "motion-safe:animate-[interaction-step-in_200ms_cubic-bezier(0.25,0.1,0.25,1)]",
        )}
        key={contentKey}
      >
        {body}
      </div>

      {footer && (
        // flex-wrap: a step with several actions (a decline beside a filled CTA,
        // longer in es/pt) must wrap onto a second row in a narrow
        // panel — the card clips overflow, so an unwrapped row loses buttons.
        <div className="mt-5 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
          {footer}
        </div>
      )}
    </div>
  );
}
