import type { ComponentType } from "react";

/** Anything that can wear the tile's icon classes: a Lucide icon, or a brand
 *  mark like `HoustonHelmet` wrapped to fill with `currentColor`. */
export type ChoiceTileIcon = ComponentType<{ className?: string }>;

/**
 * The square "create something" tile: one visual language for every modal that
 * asks "what am I making?". The sidebar's create chooser and step 1 of the
 * create-agent dialog both render a grid of these, so the second screen reads
 * as a continuation of the first rather than a different product.
 *
 * The fill is the SOLID chip pair, not `bg-input`: a modal's surface
 * (`bg-dialog`) and `bg-input` are the same neutral in dark mode, where an
 * input-filled tile disappears entirely. `chip-solid` / `chip-solid-hover` is
 * the one recessed step designed to stay visible on a solid surface in both
 * themes, and the hairline gives the edge its crisp line — dark mode carries
 * depth in hairlines, never shadows.
 *
 * On hover the tile wakes as ONE object: the fill steps up and the icon
 * sharpens from muted to ink together. Never the icon alone — a part of a
 * control changing without the whole reads as two controls.
 *
 * On a phone the square becomes a full-width row (icon, then label): three
 * squares do not fit a 343px dialog, and a stacked list of rows is what a
 * phone action sheet already looks like. At md+ the square is unchanged.
 */
export function CreateChoiceTile({
  icon: Icon,
  title,
  onClick,
  dataAttrs,
  disabled,
}: {
  icon: ChoiceTileIcon;
  title: string;
  onClick: () => void;
  /** Optional stable data attributes (e.g. a tutorial anchor). */
  dataAttrs?: Record<`data-${string}`, string>;
  /** Dim + inert (the in-app onboarding narrows the choice to one tile). */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      {...dataAttrs}
      onClick={onClick}
      disabled={disabled}
      className="ht-hairline group flex min-h-14 items-center gap-3 rounded-xl bg-chip-solid px-4 py-3 text-left text-ink outline-none transition-[background-color,transform] duration-200 hover:bg-chip-solid-hover active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-focus/50 disabled:pointer-events-none disabled:opacity-40 md:aspect-square md:min-h-0 md:flex-col md:justify-center md:py-0 md:text-center"
    >
      <Icon
        className="size-5 shrink-0 text-ink-muted transition-colors duration-200 group-hover:text-ink md:size-6"
        aria-hidden="true"
      />
      <span className="text-sm font-medium">{title}</span>
    </button>
  );
}
