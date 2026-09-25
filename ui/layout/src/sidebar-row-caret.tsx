import { cn } from "@houston-ai/core";
import { sidebarRowButtonClasses as c } from "./sidebar-paint";

/**
 * The disclosure mark: a small SOLID triangle sitting immediately after the
 * label, pointing right when the row is folded and rotating a quarter turn to
 * point down when it opens.
 *
 * Drawn here, in five numbers, rather than pulled from an icon set: no set
 * ships this shape at this weight (an outline chevron is a different mark — it
 * reads as "there is more over there", where a filled triangle reads as "this
 * thing is closed"), and a whole dependency for one path would be absurd.
 *
 * The path is centred on the 16-unit box in BOTH axes (x 5.5-10.5, y 4.5-11.5),
 * which is what lets a plain 90-degree rotation about the box centre keep the
 * mark optically still while it turns.
 */
export function SidebarRowCaret({
  expanded,
  className,
}: {
  expanded: boolean;
  /** Extra classes for hosts wearing the mark outside the rail (the shared
   *  size/ink/rotation grammar stays; only the surface-specific ink varies). */
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={cn(c.caret, expanded && "rotate-90", className)}
    >
      <path d="M5.5 4.5 L10.5 8 L5.5 11.5 Z" />
    </svg>
  );
}
