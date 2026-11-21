"use client";

import type { ReactNode } from "react";

export interface FlowChoiceRowProps {
  icon: ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  dataAttrs?: Record<`data-${string}`, string>;
}

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

export function FlowChoiceList({ children }: { children: ReactNode }) {
  return (
    <div data-slot="flow-choice-list" className="flex flex-col gap-2">
      {children}
    </div>
  );
}
