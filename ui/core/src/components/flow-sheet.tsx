"use client";

import type { ReactNode } from "react";

import { Dialog, DialogContent } from "./dialog";
import { FlowSheetCompactHeader } from "./flow-sheet-compact-header";
import {
  FLOW_SHEET_BODY_CLASSES,
  FLOW_SHEET_CONTENT_CLASSES,
  FLOW_SHEET_FOOTER_CLASSES,
  FlowSheetHeader,
  type FlowSheetSize,
} from "./flow-sheet-parts";

export type { FlowSheetSize };

export interface FlowSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The step's accessible name. In `compact` it is the visible dialog title —
   * so give that step the question it actually asks, not the flow's own name.
   */
  title: string;
  /**
   * How much room THIS step needs. Switchable while the sheet is open: a
   * two-card choice wears `compact`, a catalog to scan wears `wide`.
   */
  size?: FlowSheetSize;
  /** `wide` only: draw the title in the header instead of only naming the dialog. */
  showTitle?: boolean;
  /** The leading header control — one step back, never a second close. */
  back?: { label: string; onClick: () => void };
  /** Where the flow stands: a progress bar, dots, or nothing. */
  progress?: ReactNode;
  /** The right header slot, ahead of the close X. A step counter, a skip. */
  headerAside?: ReactNode;
  /** The actions. Pinned under the scrolling body in `wide`, inline in `compact`. */
  footer?: ReactNode;
  labels?: { close?: string };
  /** The step. One child at a time — the sheet keeps the frame still. */
  children: ReactNode;
}

/**
 * The ONE multi-step surface.
 *
 * Every wizard in the app used to bring its own dialog: its own width, its own
 * header, its own idea of where Back lives — so moving between two steps of the
 * same flow shifted the frame under the user's hands. FlowSheet fixes the
 * frame and lets only the step change.
 *
 * ONE frame, in two sizes, and the step picks which: a question with two
 * answers gets the confirm dialog's hand-sized surface, and a catalog gets the
 * tall one. Both are the same recipe — the same header slots, the same body,
 * the same place for the actions — so the flow still reads as one surface
 * while it walks. Nothing about the box is animated as it changes (DESIGN.md:
 * transform and opacity only); the step inside crossfades.
 *
 * Solid in both themes (`bg-dialog`, from DialogContent) because a flow sits
 * over arbitrary content and must never bleed it.
 */
export function FlowSheet({
  open,
  onOpenChange,
  title,
  size = "wide",
  showTitle,
  back,
  progress,
  headerAside,
  footer,
  labels,
  children,
}: FlowSheetProps) {
  const compact = size === "compact";
  const closeLabel = labels?.close ?? "Close";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Named for the recipe rather than the primitive: a flow is ONE
        // surface across every step and every size, and that is what an e2e
        // spec (and a screen reader walking the page) should be able to find.
        data-slot="flow-sheet"
        data-size={size}
        className={FLOW_SHEET_CONTENT_CLASSES[size]}
        // `wide` puts the close X in its header row, where it lines up with
        // the other two slots instead of floating over the first step's
        // content. `compact` has no such row: it keeps the dialog's own X.
        showCloseButton={compact}
        closeLabel={closeLabel}
        aria-describedby={undefined}
      >
        {compact ? (
          <FlowSheetCompactHeader
            title={title}
            back={back}
            progress={progress}
            headerAside={headerAside}
          />
        ) : (
          <FlowSheetHeader
            title={title}
            showTitle={showTitle}
            back={back}
            progress={progress}
            headerAside={headerAside}
            closeLabel={closeLabel}
          />
        )}
        <div
          data-slot="flow-sheet-body"
          // The compact body carries no classes at all — no attribute rather
          // than an empty one, so nothing reads as a box that was styled away.
          className={FLOW_SHEET_BODY_CLASSES[size] || undefined}
        >
          {children}
        </div>
        {footer ? (
          <div
            data-slot="flow-sheet-footer"
            className={FLOW_SHEET_FOOTER_CLASSES[size]}
          >
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
