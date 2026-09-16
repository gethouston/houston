"use client";

import { ChevronLeftIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "./button";
import { DialogClose, DialogTitle } from "./dialog";

/**
 * `FlowSheet`'s frames and its wide header, split from the recipe so the parts
 * that must not move between steps can be rendered and asserted on their own.
 * Not re-exported from the package index: assembling a flow out of these
 * pieces is exactly what the recipe exists to stop.
 */

/**
 * The two frames a flow may wear, chosen per STEP.
 *
 * `compact` is the ConfirmDialog/FormDialog frame — one hand-sized width, its
 * height taken from the content — and it is what a step asking ONE short thing
 * wears: a two-card choice, a name and a colour, a short form. `wide` is the
 * tall frame, for a step that is a catalog to scan.
 *
 * One size for every step was the defect: a question with two answers was
 * forced into a screen-sized surface and its cards floated in the middle of
 * nothing.
 */
export type FlowSheetSize = "compact" | "wide";

/**
 * The surface. `dvh` (never `vh`) so a phone's collapsing URL bar cannot cut
 * the flow off, and `sm:` on both caps because DialogContent's unprefixed
 * `max-w-[calc(100%-2rem)]` is the phone gutter.
 *
 * Neither frame carries a width or height TRANSITION, deliberately: the size
 * changes as the flow walks, and animating a surface's box is layout animation
 * — DESIGN.md allows transform and opacity alone. The step inside crossfades
 * instead, which is the change the eye should follow anyway.
 *
 * `compact` takes the dialog's own `p-6` and is the confirm dialog exactly:
 * height from the content, and the SHEET is the only thing that may ever
 * scroll — past the cap it scrolls as one surface, title and all. `wide` pays
 * its padding per part, because its body is the one scrolling element between
 * a fixed header and a pinned bar.
 */
export const FLOW_SHEET_CONTENT_CLASSES: Record<FlowSheetSize, string> = {
  compact:
    "flex max-h-[85dvh] flex-col gap-4 overflow-y-auto p-6 motion-reduce:animate-none sm:max-w-md",
  wide: "flex h-[85dvh] flex-col gap-0 overflow-hidden p-0 motion-reduce:animate-none sm:max-w-2xl",
};

/**
 * The step's own box.
 *
 * In `wide` it is the scrolling one — `min-h-0`, or a tall step stretches the
 * flex column instead of scrolling. In `compact` it is not a scroll container
 * at ALL: an `overflow` of any kind there is a box inside a hand-sized dialog
 * with its own bar down the side of a question that fits, and the step's
 * entrance would scroll it sideways by the 12px it travels.
 */
export const FLOW_SHEET_BODY_CLASSES: Record<FlowSheetSize, string> = {
  compact: "",
  wide: "min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8",
};

/**
 * The actions. In `compact` they sit inline at the foot of the dialog, right
 * aligned by the caller exactly as a FormDialog's footer is — no rule above
 * them, because nothing is pinned over a scroll that mostly is not there.
 *
 * In `wide` the bar is a flex sibling of the scrolling body, so it is pinned
 * to the bottom at both widths without `sticky` — and on a phone its design
 * padding stacks on the home-indicator inset with calc, because `pb-safe`
 * alone would REPLACE that padding with an inset that is 0 on desktop.
 */
export const FLOW_SHEET_FOOTER_CLASSES: Record<FlowSheetSize, string> = {
  compact: "shrink-0",
  wide: "shrink-0 border-t border-line px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+theme(spacing.4))] md:px-8 md:py-4",
};

export interface FlowSheetHeaderProps {
  title: string;
  /** Renders the title in the centre slot instead of only naming the dialog. */
  showTitle?: boolean;
  back?: { label: string; onClick: () => void };
  progress?: ReactNode;
  headerAside?: ReactNode;
  closeLabel: string;
}

/**
 * The WIDE frame's header: three fixed slots, always all three — back ·
 * progress · aside + close. The side slots are equal flex tracks and the
 * middle one never grows, so the progress indicator sits dead centre on step
 * one and has not moved by step four; a header that re-centres itself when a
 * Back button appears is the tell that a flow was assembled per-step.
 *
 * The title is screen-reader-only here unless the caller asks for it: a wide
 * step carries its own headline over its content, and a second, smaller copy
 * of the flow's name above it says nothing the user needed.
 */
export function FlowSheetHeader({
  title,
  showTitle,
  back,
  progress,
  headerAside,
  closeLabel,
}: FlowSheetHeaderProps) {
  return (
    <header
      data-slot="flow-sheet-header"
      className="flex h-12 shrink-0 items-center gap-2 px-5"
    >
      <div
        data-slot="flow-sheet-back"
        className="flex min-w-0 flex-1 items-center justify-start"
      >
        {back ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2 gap-1 px-2 text-ink-muted hover:text-ink"
            onClick={back.onClick}
          >
            <ChevronLeftIcon aria-hidden="true" />
            <span className="truncate">{back.label}</span>
          </Button>
        ) : null}
      </div>
      <div
        data-slot="flow-sheet-progress"
        className="flex shrink-0 items-center justify-center"
      >
        <DialogTitle
          className={
            progress || !showTitle ? "sr-only" : "text-sm font-medium text-ink"
          }
        >
          {title}
        </DialogTitle>
        {progress}
      </div>
      <div
        data-slot="flow-sheet-aside"
        className="flex min-w-0 flex-1 items-center justify-end gap-1"
      >
        {headerAside}
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-mr-2 text-ink-muted hover:text-ink"
          >
            <XIcon aria-hidden="true" />
            <span className="sr-only">{closeLabel}</span>
          </Button>
        </DialogClose>
      </div>
    </header>
  );
}
