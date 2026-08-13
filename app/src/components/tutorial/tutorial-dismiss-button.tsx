import { cn } from "@houston-ai/core";
import { X } from "lucide-react";

/**
 * The way out of a guided beat, worn by the beat's OWN surface.
 *
 * It rides the card it closes rather than standing in a fixed corner of the
 * window: the surface moves (the coach card follows its target across the
 * screen), and a detached chip both drifts onto the app's real controls and
 * falls outside the card's `aria-modal` scope, where a screen reader can never
 * reach it. Inside the dialog it is simply the dialog's close.
 *
 * The house close idiom, from `ui/core`'s dialog: same corner, same 16px icon
 * on a quiet hover plate, same muted-to-ink shift. Callers pass `className` to
 * seat it in their own geometry (a `p-8` card insets it further than a compact
 * chip does).
 *
 * Rendered only where an exit exists: the mandatory setup shares these
 * primitives and offers none, so it never passes a handler and never gets one.
 */
export function TutorialDismissButton(props: {
  /** Already translated; the button is icon-only, so this IS the name. */
  label: string;
  onDismiss: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      onClick={props.onDismiss}
      className={cn(
        "absolute rounded-lg p-1.5 text-ink-muted outline-none transition-colors duration-200 hover:bg-hover hover:text-ink focus-visible:ring-[3px] focus-visible:ring-focus/50",
        props.className,
      )}
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  );
}
