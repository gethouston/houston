import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * One way forward from the team card's choice, built to be unmistakably a
 * button: a raised tile on the card (surface, border, a soft shadow in light),
 * a picture of what it leads to, and a filled arrow that says "go". The whole
 * tile is the target; hover firms the border and nudges the arrow, a press
 * sinks it, and focus draws the app's ring.
 *
 * The picture is decorative, so the button's name is its label and
 * description alone.
 */
export function TeamChoiceCard({
  visual,
  label,
  description,
  onSelect,
}: {
  visual: ReactNode;
  label: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="group flex w-full flex-col gap-4 rounded-2xl border border-line-input bg-background p-4 text-left shadow-xs outline-none transition-[transform,border-color] duration-200 ease-out hover:border-ink/40 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] md:p-5 dark:shadow-none"
    >
      <span className="flex items-center justify-between gap-3">
        {visual}
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-action text-action-text transition-transform duration-200 ease-out group-hover:translate-x-0.5"
        >
          <ArrowRight className="size-4" />
        </span>
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-base font-medium text-ink">{label}</span>
        <span className="text-sm text-ink-muted">{description}</span>
      </span>
    </button>
  );
}
