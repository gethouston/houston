"use client";

import { cn } from "@houston-ai/core";

export function SortPills<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-full px-4 py-1.5 font-medium text-sm transition-colors focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:outline-none",
            value === option.value
              ? "bg-action text-action-text"
              : "bg-chip-subtle text-ink-muted hover:bg-chip hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
