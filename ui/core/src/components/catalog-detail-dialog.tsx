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
  icon: ReactNode;
  title: string;
  tags?: ReactNode;
  description?: string;
  children?: ReactNode;
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
