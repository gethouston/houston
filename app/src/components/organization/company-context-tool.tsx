import { Sheet } from "@houston-ai/core";
import { type ReactNode, useState } from "react";
import { PageHeaderTools } from "../shell/page-header/page-header-tools";
import {
  CompanyContextSheetContent,
  CompanyContextTrigger,
} from "./company-context-sheet";

export function CompanyContextTool({
  onOpened,
  children,
}: {
  onOpened: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const change = (next: boolean) => {
    if (next && !open) onOpened();
    setOpen(next);
  };
  return (
    <Sheet open={open} onOpenChange={change}>
      <PageHeaderTools>
        {(inStrip) => (
          <div
            className={
              inStrip
                ? "flex items-center"
                : "flex shrink-0 justify-end px-5 pb-2"
            }
          >
            <CompanyContextTrigger />
          </div>
        )}
      </PageHeaderTools>
      <CompanyContextSheetContent>{children}</CompanyContextSheetContent>
    </Sheet>
  );
}
