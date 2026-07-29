/**
 * The Files list's selection checkbox. A real `<input type="checkbox">` sits
 * transparent over a styled box, which is what keeps it keyboard-reachable and
 * focusable while the box carries Houston's fill — the same construction the
 * board's cards use. Unlike the board's, this one is ALWAYS visible: the list
 * has a permanent gutter for it, and hover only strengthens its border. There
 * is no hover-only affordance here.
 */
import { cn } from "@houston-ai/core";
import { Check, Minus } from "lucide-react";
import { useEffect, useRef } from "react";

export function FilesCheckbox({
  checked,
  indeterminate,
  label,
  onToggle,
}: {
  checked: boolean;
  /** Some but not all of the group is checked (header / selection bar). */
  indeterminate?: boolean;
  label: string;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // `indeterminate` is a DOM property with no attribute, so assistive tech only
  // agrees with the glyph if it is set on the element itself.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);

  return (
    <span
      className={cn(
        "relative flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus",
        checked || indeterminate
          ? "border-action bg-action text-action-text"
          : "border-ink-muted/40 text-transparent group-hover/row:border-ink",
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        aria-label={label}
        // A checkbox gesture is a selection, never an open: none of these may
        // reach the row underneath, whose click and Enter both open the file.
        onChange={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
      {indeterminate ? (
        <Minus
          aria-hidden
          className="pointer-events-none size-3"
          strokeWidth={3}
        />
      ) : (
        <Check
          aria-hidden
          className="pointer-events-none size-3"
          strokeWidth={3}
        />
      )}
    </span>
  );
}
