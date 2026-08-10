import { cn } from "@houston-ai/core";
import { Check } from "lucide-react";

/**
 * The chip+colour WASH every tinted surface of the identity picker wears — the
 * same recipe `HoustonAvatar` washes an agent's colour with, so a tinted team
 * button, a hovered glyph cell and an agent avatar speak one grammar. The
 * tint arrives via `--identity-tint`, set inline wherever a wash class is
 * applied (the classes are meaningless without it).
 */
export const WASH =
  "bg-[color-mix(in_srgb,var(--ht-chip)_82%,var(--identity-tint)_18%)]";
export const WASH_HOVER =
  "hover:bg-[color-mix(in_srgb,var(--ht-chip)_82%,var(--identity-tint)_18%)]";
export const WASH_STRONG =
  "bg-[color-mix(in_srgb,var(--ht-chip)_68%,var(--identity-tint)_32%)]";
export const WASH_STRONG_HOVER =
  "hover:bg-[color-mix(in_srgb,var(--ht-chip)_72%,var(--identity-tint)_28%)]";

/**
 * One circle of the identity picker's swatch row — the agent palette only, no
 * synthetic "default" entry (a gray no-colour circle would be a colour agents
 * cannot wear). The selected circle carries the check INSIDE it rather than a
 * ring, so one glance finds the current colour without scanning edges.
 */
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
      // A raw colour value never reaches a className: the palette is the
      // host's, so it arrives as data and is painted inline.
      style={{ backgroundColor: value }}
    >
      {selected && <Check className="size-3.5 text-white" aria-hidden="true" />}
    </button>
  );
}
