"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";

/**
 * The catalog item's "more info" modal — what a {@link CatalogRow} body click
 * opens: the item's art + name (with optional tag chips beside it), its full
 * untruncated description, any extra `children`, and the install CTA in the
 * footer. Domain-blind like the rest of the family: the consumer owns the
 * icon, the tags, the action button, and every string.
 */
export function CatalogDetailDialog({
  open,
  onOpenChange,
  icon,
  title,
  tags,
  description,
  children,
  action,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The item's art (~40px), same node the row leads with. */
  icon: ReactNode;
  title: string;
  /** Small chips under the title (categories, kind badges...). */
  tags?: ReactNode;
  /** The FULL description — this surface exists so it never truncates. */
  description?: string;
  children?: ReactNode;
  /** The footer CTA (install / connect), owned by the consumer. */
  action?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-4">
            {icon}
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-left">{title}</DialogTitle>
              {tags && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">{tags}</div>
              )}
            </div>
          </div>
        </DialogHeader>
        {description && (
          <DialogDescription className="text-left text-sm/relaxed">
            {description}
          </DialogDescription>
        )}
        {children}
        {action && <DialogFooter>{action}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
