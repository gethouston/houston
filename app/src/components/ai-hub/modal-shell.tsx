/**
 * The redesign's modal primitive. Built on the app's shared Radix Dialog
 * (`@houston-ai/core`) so focus-trap, ESC and aria come for free; the panel is
 * a three-row grid (fixed header, scrolling body, thin footer) on a SOLID
 * `bg-background` surface (opaque white in light, solid near-black in dark — no
 * glass, no page bleed-through) with `ht-shadow-modal` for float. Core's
 * DialogContent renders the ONE scrim (`bg-black/40`); we don't stack a second.
 * The calm entry (fade + a small 0.98→1 scale, reduced-motion honored) lives in
 * `.ai-hub-modal-surface` (futuristic.css). Presentational and props-only:
 * titles/labels arrive already translated (parents own i18n).
 */

import {
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@houston-ai/core";
import type { ReactNode } from "react";

export function ModalShell({
  open,
  onClose,
  title,
  description,
  children,
  header,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const srDescription = description ? (
    <DialogDescription className="sr-only">{description}</DialogDescription>
  ) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {/* Core's DialogContent renders the single `bg-black/40` scrim itself, so
          the panel just floats over it — one overlay, no second blur layer. */}
      <DialogContent
        showCloseButton={false}
        className={cn(
          "grid max-h-[84vh] min-h-[60vh] w-[min(620px,calc(100vw-2.5rem))] max-w-none grid-rows-[auto_1fr_auto] gap-0 overflow-hidden rounded-2xl border-0 bg-background p-0 ht-shadow-modal ai-hub-modal-surface sm:max-w-none",
          className,
        )}
      >
        {header ? (
          <div>
            <DialogTitle className="sr-only">{title}</DialogTitle>
            {srDescription}
            {header}
          </div>
        ) : (
          <div className="flex flex-col gap-1 px-5 pt-5 pb-4">
            <DialogTitle className="text-[17px] font-semibold text-foreground tracking-[-0.01em]">
              {title}
            </DialogTitle>
            {description ? (
              <DialogDescription className="text-[13px] text-muted-foreground">
                {description}
              </DialogDescription>
            ) : null}
          </div>
        )}
        {/* `min-h-0` lets this 1fr grid row shrink below its content so it
            becomes the SINGLE bounded scroll area. Without it the row's default
            `min-height: auto` grows to the content, the modal overflows its
            `max-h`, and the inner scroll never engages — the tall provider model
            lists then read as a second, janky scroll. */}
        <div className="min-h-0 overflow-y-auto">{children}</div>
        {footer ? (
          <div className="border-t border-border px-5 py-3">{footer}</div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
