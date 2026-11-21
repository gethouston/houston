import { CATALOG_PLANE_MAX_W, cn } from "@houston-ai/core";
import type { ReactNode } from "react";

export function SkillsSurfaceFrame({
  header,
  contentClassName,
  dataAttrs,
  children,
}: {
  header?: ReactNode;
  contentClassName?: string;
  dataAttrs?: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <div {...dataAttrs}>
      {header}
      <div
        className={cn("mx-auto w-full", CATALOG_PLANE_MAX_W, contentClassName)}
      >
        {children}
      </div>
    </div>
  );
}
