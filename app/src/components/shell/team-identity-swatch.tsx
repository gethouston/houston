import { cn } from "@houston-ai/core";
import { Check } from "lucide-react";

export const WASH =
  "bg-[color-mix(in_srgb,var(--ht-chip)_82%,var(--identity-tint)_18%)]";
export const WASH_HOVER =
  "hover:bg-[color-mix(in_srgb,var(--ht-chip)_82%,var(--identity-tint)_18%)]";
export const WASH_STRONG =
  "bg-[color-mix(in_srgb,var(--ht-chip)_68%,var(--identity-tint)_32%)]";
export const WASH_STRONG_HOVER =
  "hover:bg-[color-mix(in_srgb,var(--ht-chip)_72%,var(--identity-tint)_28%)]";

export function ColorSwatch({
  label,
  value,
  selected,
  onClick,
}: {
  label: string;
  value: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full transition-transform duration-100 outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
        !selected && "hover:scale-110",
      )}
      style={{ backgroundColor: value }}
    >
      {selected && <Check className="size-3.5 text-white" aria-hidden="true" />}
    </button>
  );
}
