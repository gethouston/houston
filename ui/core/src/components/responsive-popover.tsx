"use client";

import * as React from "react";
import { useIsMobile } from "../hooks/use-mobile";
import { cn } from "../utils";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

/**
 * One picker, two presentations: an anchored popover on desktop and a bottom
 * sheet below the one breakpoint. A popover pinned to a 28px pill has nowhere
 * to go on a phone (it goes edge to edge and lands on top of the composer);
 * the sheet gives the same content the full width, a title, and the home
 * indicator's safe area. A structural fork, so it reads `useIsMobile()`.
 *
 * The trigger and content are the same children either way; `title` is the
 * sheet's heading (a dialog needs an accessible name) and is not rendered in
 * the popover form.
 */

const MobileContext = React.createContext(false);

function ResponsivePopover({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const mobile = useIsMobile();
  const Root = mobile ? Sheet : Popover;
  return (
    <MobileContext.Provider value={mobile}>
      <Root open={open} onOpenChange={onOpenChange}>
        {children}
      </Root>
    </MobileContext.Provider>
  );
}

function ResponsivePopoverTrigger(
  props: React.ComponentProps<typeof PopoverTrigger>,
) {
  const mobile = React.useContext(MobileContext);
  return mobile ? (
    <SheetTrigger data-slot="responsive-popover-trigger" {...props} />
  ) : (
    <PopoverTrigger data-slot="responsive-popover-trigger" {...props} />
  );
}

function ResponsivePopoverContent({
  title,
  className,
  sheetClassName,
  children,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...popoverProps
}: React.ComponentProps<typeof PopoverContent> & {
  /** The sheet's heading; doubles as its accessible name. */
  title: string;
  /** Extra classes for the sheet form only (the popover takes `className`). */
  sheetClassName?: string;
}) {
  const mobile = React.useContext(MobileContext);
  if (mobile) {
    return (
      <SheetContent
        side="bottom"
        showCloseButton={false}
        data-slot="responsive-popover-sheet"
        className={cn(
          "max-h-[85dvh] gap-0 rounded-t-2xl border-t-0 pb-safe",
          sheetClassName,
        )}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-sm">{title}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </SheetContent>
    );
  }
  return (
    <PopoverContent
      className={className}
      onOpenAutoFocus={onOpenAutoFocus}
      onCloseAutoFocus={onCloseAutoFocus}
      {...popoverProps}
    >
      {children}
    </PopoverContent>
  );
}

export {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
};
