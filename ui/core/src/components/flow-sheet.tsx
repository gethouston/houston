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
  title: string;
  size?: FlowSheetSize;
  showTitle?: boolean;
  back?: { label: string; onClick: () => void };
  progress?: ReactNode;
  headerAside?: ReactNode;
  footer?: ReactNode;
  labels?: { close?: string };
  children: ReactNode;
}

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
        data-slot="flow-sheet"
        data-size={size}
        className={FLOW_SHEET_CONTENT_CLASSES[size]}
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
