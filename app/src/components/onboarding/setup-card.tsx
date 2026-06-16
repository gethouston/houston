import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { Button, cn } from "@houston-ai/core";

/**
 * The one frame every first-run setup screen shares, so Welcome, the agreement,
 * and each onboarding step read as a single coherent flow rather than a pile of
 * mismatched screens. Modeled on the Discord server-onboarding pattern: a
 * centered card on a dimmed backdrop with a small step eyebrow, one clear
 * question, the content, and a Back / helper / Next footer.
 *
 * Houston-monochrome, not Discord-blue: selection uses the near-black
 * foreground, never a decorative accent (design-system color restraint).
 */
interface SetupCardProps {
  /** Optional brand mark above the eyebrow (used by the Welcome hero). */
  icon?: ReactNode;
  /** Small muted line above the title, e.g. "Step 2 of 3" or "Welcome". */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  /** Muted helper text shown between Back and Next (the "you'll be added to…"
   *  line in the reference). */
  helper?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
}

export function SetupCard({
  icon,
  eyebrow,
  title,
  subtitle,
  children,
  helper,
  onBack,
  backLabel,
  onNext,
  nextLabel,
  nextDisabled,
  nextLoading,
}: SetupCardProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-secondary/60 px-6 text-foreground">
      {/* Keyed by title so React remounts (and the CSS entrance replays) on
          each step change, but not on in-step state updates like typing. */}
      <div
        key={title}
        className="setup-step-in flex w-full max-w-2xl flex-col rounded-2xl border border-black/10 bg-background p-8 shadow-[0_1px_0_rgba(0,0,0,0.05)]"
      >
        {icon && <div className="mb-4">{icon}</div>}
        {eyebrow && (
          <p className="text-xs font-medium text-muted-foreground">{eyebrow}</p>
        )}
        <h1 className="mt-1 text-[22px] font-semibold leading-tight">{title}</h1>
        {subtitle && (
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        )}

        <div className="mt-6">{children}</div>

        {(onBack || onNext || helper) && (
          <div className="mt-8 flex items-center justify-between gap-4">
            <div className="shrink-0">
              {onBack && (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={onBack}
                >
                  <ArrowLeft className="size-4" />
                  {backLabel}
                </Button>
              )}
            </div>
            {helper && (
              <p className="flex-1 text-right text-xs text-muted-foreground">
                {helper}
              </p>
            )}
            <div className="shrink-0">
              {onNext && (
                <Button
                  type="button"
                  className="rounded-full"
                  onClick={onNext}
                  disabled={nextDisabled || nextLoading}
                >
                  {nextLoading && <Loader2 className="size-4 animate-spin" />}
                  {nextLabel}
                  {!nextLoading && <ArrowRight className="size-4" />}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Two-column grid container for `OptionCard`s. */
export function OptionGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
  );
}

interface OptionCardProps {
  /** 1-based position shown at the left, like the reference. Omit to hide. */
  number?: number;
  label: string;
  description?: string;
  selected: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  /** Replaces the radio indicator (e.g. a connected pill / spinner). */
  trailing?: ReactNode;
  /** Extra content revealed inside the card (e.g. a sign-in hint when picked). */
  children?: ReactNode;
}

/**
 * A numbered, single-select option card matching the reference: number on the
 * left, bold label + muted description, a radio dot on the right that fills
 * with a check when selected. The whole card is the click target.
 */
export function OptionCard({
  number,
  label,
  description,
  selected,
  onSelect,
  disabled,
  trailing,
  children,
}: OptionCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex w-full flex-col gap-3 rounded-xl border bg-background p-4 text-left transition-all",
        disabled
          ? "cursor-not-allowed border-black/5 opacity-60"
          : "border-black/10 hover:border-black/25",
        selected && !disabled && "border-foreground",
      )}
    >
      <div className="flex items-start gap-3">
        {number != null && (
          <span className="mt-0.5 w-4 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
            {number}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <span className="shrink-0">
          {trailing ?? <RadioDot selected={selected} />}
        </span>
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
        "flex size-5 items-center justify-center rounded-full border transition-colors",
        selected ? "border-foreground bg-foreground" : "border-black/25",
      )}
    >
      {selected && <Check className="size-3 text-background" />}
    </span>
  );
}
