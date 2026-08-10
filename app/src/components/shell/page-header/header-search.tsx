import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";

/**
 * The header's ONE search treatment, wrapped around whatever field a section
 * brings: a fixed compact width in the strip, full-width in the stacked row.
 * Several sections carry a search into the strip — the board, the catalogs —
 * and the widths must be the same treatment in all of them, not hand-kept
 * copies. The strip form deliberately does NOT grow on focus: the growing
 * field kept shoving its neighbors around, and the compact width is enough.
 *
 * A native `<search>`, not a div with a role: this wrapper IS the search
 * landmark.
 */
export function HeaderSearch({
  inStrip,
  rowClassName = "min-w-0 flex-1",
  children,
}: {
  /** Strip form (fixed compact width) vs stacked row form (full width). */
  inStrip: boolean;
  /** Row-form sizing; the strip form sizes itself. */
  rowClassName?: string;
  children: ReactNode;
}) {
  return (
    <search className={cn(inStrip ? "w-[220px]" : rowClassName)}>
      {children}
    </search>
  );
}
