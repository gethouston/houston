"use client";

import type { ReactNode } from "react";

export interface FlowChoiceRowProps {
  /** A 20px Lucide glyph. Inherits the button's ink, so pass it unstyled. */
  icon: ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  /** Hooks for e2e and the product tour — `data-*` only, never styling. */
  dataAttrs?: Record<`data-${string}`, string>;
}

/**
 * One answer to "what am I making?": a rectangular button carrying its glyph
 * and its title, nothing else. The title IS the description; a second line
 * under it and a chevron beside it were chrome around a two-word choice.
 *
 * Rectangular on purpose: the pill is the grammar of an ACTION on a page,
 * and this is a door in a list of doors, so it takes the chip's soft fill and
 * the input's radius. Pressing it IS the answer.
 */
export function FlowChoiceRow({
  icon,
  title,
  onClick,
  disabled,
  dataAttrs,
}: FlowChoiceRowProps) {
  return (
    <button
      type="button"
      data-slot="flow-choice-row"
      onClick={onClick}
      disabled={disabled}
      {...dataAttrs}
      className="flex h-11 w-full items-center gap-3 rounded-lg bg-chip px-4 text-left text-sm font-medium text-chip-text outline-none transition-[background-color,transform] duration-200 hover:bg-chip-text/15 active:scale-[0.99] focus-visible:ring-[3px] focus-visible:ring-focus/50 disabled:pointer-events-none disabled:opacity-50"
    >
      <span aria-hidden="true" className="flex shrink-0 [&_svg]:size-5">
        {icon}
      </span>
      <span className="min-w-0 truncate">{title}</span>
    </button>
  );
}

/** The doors, stacked in one column at every width with a small gap. */
export function FlowChoiceList({ children }: { children: ReactNode }) {
  return (
    <div data-slot="flow-choice-list" className="flex flex-col gap-2">
      {children}
    </div>
  );
}
