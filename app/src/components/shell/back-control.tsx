import { cn } from "@houston-ai/core";
import { ChevronLeft } from "lucide-react";

export interface BackTarget {
  label: string;
  onClick: () => void;
}

export type BackControlSize = "default" | "compact";

const SIZE_CLASS: Record<BackControlSize, string> = {
  default:
    "size-10 border border-line bg-chip text-ink md:size-auto md:gap-1 md:rounded-sm md:border-0 md:bg-transparent md:text-ink-muted md:text-sm md:hover:text-ink",
  compact: "size-8 text-ink-muted hover:bg-hover hover:text-ink",
};

export function BackControl({
  label,
  onClick,
  size = "default",
}: BackTarget & { size?: BackControlSize }) {
  const compact = size === "compact";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-focus",
        SIZE_CLASS[size],
      )}
    >
      <ChevronLeft className="size-4" />
      <span className={compact ? "sr-only" : "sr-only md:not-sr-only"}>
        {label}
      </span>
    </button>
  );
}
