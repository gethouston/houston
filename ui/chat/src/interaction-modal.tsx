"use client";

import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
  ScrollArea,
} from "@houston-ai/core";
import { ChevronDown, XIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { InteractionPager } from "./interaction-modal-pager";

/**
 * The compact `‹ N of M ›` pager pinned top-right of the modal header.
 * It belongs to the shared shell so every step kind uses one navigation contract.
 */
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
  collapseLabel?: string;
  expandLabel?: string;
  /** A muted one-line explanation retained in the header while collapsed. */
  collapsedHint?: ReactNode;
  /** The step content (option rows, the reason body, etc.). */
  body: ReactNode;
  /** The right-aligned footer actions row (the unified decline, plus a CTA for
   *  signin/connect). Omitted renders no footer. */
  footer?: ReactNode;
  /** Optional content rendered after the footer, such as a free-text escape
   *  row. Keeps secondary input below the card-wide actions. The node owns
   *  its own top spacing (no wrapper margin is added). */
  trailing?: ReactNode;
  /** Fades the body region on change so a step swap reads as "content changed,
   *  chrome stayed" (gated by the motion-safe media query). */
  contentKey?: string;
  disabled?: boolean;
  /** Controlled collapse state. Omit both props for an initially expanded card. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
 * the title, body, footer, and optional trailing nodes they hand in.
 *
 * How it composes with the composer is the caller's call (see ChatPanel's
 * `composerOverrideMode`): a full interaction stepper replaces the composer's
 * slot (the stepper and the plan-approval card both do), while the lighter
 * suggestion offers float above the still-mounted one.
 * Weight is restrained across the whole family: ONE regular step of hierarchy,
 * never competing bolds — color tone (foreground vs muted) carries the structure.
 */
export function InteractionModal({
  title,
  pager,
  onDismiss,
  dismissLabel = "Dismiss",
  collapseLabel = "Collapse interaction",
  expandLabel = "Expand interaction",
  collapsedHint,
  body,
  footer,
  trailing,
  contentKey,
  disabled = false,
  open: controlledOpen,
  onOpenChange,
}: InteractionModalProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(true);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const showPager = pager != null && pager.total > 1;
  const showHeader = true;

  return (
    <Collapsible
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
      onOpenChange={setOpen}
      open={open}
    >
      {showHeader && (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {title}
            {!open && collapsedHint && (
              <div className="truncate text-ink-muted text-sm leading-5">
                {collapsedHint}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {showPager && pager && (
              <InteractionPager disabled={disabled} pager={pager} />
            )}
            <CollapsibleTrigger asChild>
              <Button
                aria-label={open ? collapseLabel : expandLabel}
                className="shrink-0 text-ink-muted"
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform duration-200 motion-reduce:transition-none",
                    open ? "rotate-0" : "rotate-180",
                  )}
                />
              </Button>
            </CollapsibleTrigger>
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

      <CollapsibleContent>
        <ScrollArea viewportClassName="max-h-[40vh]">
          <div
            className={cn(
              showHeader && "mt-3",
              "motion-safe:animate-[interaction-step-in_200ms_cubic-bezier(0.25,0.1,0.25,1)]",
            )}
            key={contentKey}
          >
            {body}
          </div>
        </ScrollArea>
        {footer && (
          <div className="mt-5 flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
            {footer}
          </div>
        )}
        {trailing}
      </CollapsibleContent>
    </Collapsible>
  );
}
