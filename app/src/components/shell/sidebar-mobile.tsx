import { Sheet, SheetContent, SheetTitle } from "@houston-ai/core";
import type { ReactNode } from "react";

/**
 * Mobile (<768px) presentation of the app sidebar: the same `AppSidebar`
 * element the desktop rail renders, hosted in a left-side Sheet drawer
 * instead of a fixed 220px column. The drawer wears `bg-gutter` (a solid
 * surface in both themes) because the sidebar's own tokens are transparent
 * by design; floating surfaces must never be glass.
 */
export function MobileSidebarSheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Screen-reader name for the drawer (dialogs need an accessible title). */
  title: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        showCloseButton={false}
        aria-describedby={undefined}
        className="w-[280px] gap-0 border-line bg-gutter p-0"
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}
