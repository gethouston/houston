"use client";

import { ChevronLeftIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "./button";
import { DialogCloseButton, DialogTitle } from "./dialog";

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

export const FLOW_SHEET_CONTENT_CLASSES: Record<FlowSheetSize, string> = {
  compact:
    "flex max-h-[85dvh] flex-col gap-4 overflow-y-auto p-6 motion-reduce:animate-none sm:max-w-md",
  wide: "flex h-[85dvh] flex-col gap-0 overflow-hidden p-0 motion-reduce:animate-none sm:max-w-[min(42rem,calc(100%-2rem))]",
};

export const FLOW_SHEET_BODY_CLASSES: Record<FlowSheetSize, string> = {
  compact: "",
  wide: "min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8",
};

export const FLOW_SHEET_FOOTER_CLASSES: Record<FlowSheetSize, string> = {
  compact: "shrink-0",
  wide: "shrink-0 border-t border-line px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+theme(spacing.4))] md:px-8 md:py-4",
};

export interface FlowSheetHeaderProps {
  title: string;
  showTitle?: boolean;
  back?: { label: string; onClick: () => void };
  progress?: ReactNode;
  headerAside?: ReactNode;
  closeLabel: string;
}

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
        <DialogCloseButton label={closeLabel} className="-mr-1.5" />
      </div>
    </header>
  );
}
