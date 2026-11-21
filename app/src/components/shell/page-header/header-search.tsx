import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";

export function HeaderSearch({
  inStrip,
  rowClassName = "min-w-0 flex-1",
  children,
}: {
  inStrip: boolean;
  rowClassName?: string;
  children: ReactNode;
}) {
  return (
    <search className={cn(inStrip ? "w-[220px]" : rowClassName)}>
      {children}
    </search>
  );
}
