import { cn } from "@houston-ai/core";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

interface OptionCardProps {
  /** Leading media (e.g. a provider logo or a coloured tile) shown before the
   *  label. Rendered as-is, so the caller owns any tile styling. */
  leading?: ReactNode;
  label: string;
  description?: string;
  selected: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  /** Replaces the radio indicator (e.g. a connected pill / chevron / spinner). */
  trailing?: ReactNode;
  /** Extra content revealed inside the row (e.g. a sign-in hint when picked). */
  children?: ReactNode;
}

/**
 * A single-select row styled as an instructional step, not a filled button: no
 * background at rest, a faint hover wash, and a left accent bar to mark the pick
 * (never a full ring around the box, which read as a UI control). Selection is
 * always visible without hovering — the left accent and the radio dot carry it
 * (design-system: no hover-only affordances). The whole row is the click target.
 */
export function OptionCard({
  leading,
  label,
  description,
  selected,
  onSelect,
  disabled,
  trailing,
  children,
}: OptionCardProps) {
  // The right-side radio only carries selection when nothing on the left does
  // (the plain label rows). Leading-media rows carry it via their own visuals.
  const showRadio = trailing === undefined && leading == null;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex w-full flex-col gap-3 rounded-lg border-l-2 py-3 pr-3 pl-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        disabled
          ? "cursor-not-allowed border-transparent opacity-50"
          : "border-transparent hover:bg-foreground/[0.04]",
        selected && !disabled && "border-l-foreground bg-foreground/[0.05]",
      )}
    >
      <div className="flex items-center gap-3">
        {leading && <span className="shrink-0">{leading}</span>}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {trailing ?? (showRadio ? <RadioDot selected={selected} /> : null)}
      </div>
      {children}
    </button>
  );
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
        selected ? "border-foreground bg-foreground" : "border-foreground/25",
      )}
    >
      {selected && <Check className="size-3 text-background" />}
    </span>
  );
}
