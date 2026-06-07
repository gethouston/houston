import type { ReactNode } from "react";
import { DialogContent, DialogFooter, DialogHeader } from "@houston-ai/core";

/** Shared connect-dialog shell: capped height, scrollable body, pinned footer. */
export const CONNECT_DIALOG_CONTENT_CLASS =
  "max-w-md max-h-[min(85vh,calc(100vh-2rem))] grid grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0";

export function ConnectDialogShell(props: {
  header: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <DialogContent className={CONNECT_DIALOG_CONTENT_CLASS}>
      <DialogHeader className="shrink-0 gap-2 px-6 pt-6 pb-2 text-left">
        {props.header}
      </DialogHeader>
      <div className="min-h-0 overflow-y-auto px-6 py-2">{props.children}</div>
      <DialogFooter className="shrink-0 flex-wrap gap-2 border-t border-border/50 px-6 py-4 sm:justify-end">
        {props.footer}
      </DialogFooter>
    </DialogContent>
  );
}

export function ConnectOrSeparator({ label }: { label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
      <div className="h-px min-w-0 flex-1 bg-border" />
      <span className="shrink-0">{label}</span>
      <div className="h-px min-w-0 flex-1 bg-border" />
    </div>
  );
}
