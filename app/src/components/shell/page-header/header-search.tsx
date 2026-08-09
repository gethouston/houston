import { cn } from "@houston-ai/core";
import { type FocusEvent, type ReactNode, useState } from "react";
import { searchFieldGrown } from "./page-header-layout";

/**
 * The header's ONE search treatment, wrapped around whatever field a section
 * brings: compact in the strip and grown while it is being used
 * (`searchFieldGrown`), full-width in the stacked row. Three sections carry a
 * search into the strip now — the board, the catalog, custom integrations —
 * and the growth rule, the widths and the focus bookkeeping must be the same
 * treatment in all of them, not three hand-kept copies.
 *
 * React's focus events bubble (the DOM's do not), so the wrapper hears the
 * input without the input having to expose a callback for it. The
 * `relatedTarget` guard keeps the field grown when focus moves to the clear
 * button INSIDE it — otherwise clearing would shrink the field out from under
 * the pointer mid-click.
 *
 * A native `<search>`, not a div with a role: this wrapper IS the search
 * landmark, which is what makes a focus handler on it legitimate rather than
 * interactivity bolted to a bare div.
 */
export function HeaderSearch({
  query,
  inStrip,
  rowClassName = "min-w-0 flex-1",
  children,
}: {
  /** The live query — a non-empty one keeps the field grown after blur. */
  query: string;
  /** Strip form (compact, grows in use) vs stacked row form (full width). */
  inStrip: boolean;
  /** Row-form sizing; the strip form sizes itself. */
  rowClassName?: string;
  children: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const grown = searchFieldGrown(focused, query);

  return (
    <search
      className={cn(
        inStrip
          ? // The one deliberate exception to `/DESIGN.md`'s "animate only
            // transform and opacity": a text field cannot be widened by a
            // transform without stretching the glyphs inside it. It is ONE
            // element, `duration-200` (the `fast` token) and ease-OUT, which
            // is the entrance direction the same doc asks for.
            "transition-[width] duration-200 ease-out motion-reduce:transition-none"
          : rowClassName,
        inStrip && (grown ? "w-[380px]" : "w-[220px]"),
      )}
      onFocus={() => setFocused(true)}
      onBlur={(event: FocusEvent<HTMLElement>) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setFocused(false);
      }}
    >
      {children}
    </search>
  );
}
