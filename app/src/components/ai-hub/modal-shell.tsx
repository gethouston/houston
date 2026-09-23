/**
 * AI Hub details wear the shared Dialog frame, with a fixed header and footer
 * around a scrolling body. Dialog owns focus trapping, Escape, the scrim and
 * entry motion. Titles and labels arrive translated; parents own i18n.
 */

import {
  cn,
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@houston-ai/core";
import type { ReactNode } from "react";

export function ModalShell({
  open,
  onClose,
  closeLabel,
  title,
  description,
  children,
  header,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  closeLabel: string;
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
      <DialogContent
        showCloseButton={false}
        className={cn(
          // The wide flow sheet's width, minus the phone gutter the plain
          // `sm:` cap would drop between 640px and the cap itself.
          "flex max-h-[85dvh] min-h-[60dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(42rem,calc(100%-2rem))]",
          className,
        )}
      >
        <div className="flex shrink-0 items-start gap-2 px-5 pt-5 pb-4">
          <div className="min-w-0 flex-1">
            {header ? (
              <>
                <DialogTitle className="sr-only">{title}</DialogTitle>
                {srDescription}
                {header}
              </>
            ) : (
              <div className="flex flex-col gap-1.5">
                <DialogTitle>{title}</DialogTitle>
                {description ? (
                  <DialogDescription>{description}</DialogDescription>
                ) : null}
              </div>
            )}
          </div>
          <DialogCloseButton label={closeLabel} className="-mr-1.5" />
        </div>
        {/* `min-h-0` lets the body in this flex column shrink below its content so it
            becomes the SINGLE bounded scroll area. Without it the body's default
            `min-height: auto` grows to the content, the modal overflows its
            `max-h`, and the inner scroll never engages — the tall provider model
            lists then read as a second, janky scroll. */}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-line px-5 py-3">
            {footer}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
