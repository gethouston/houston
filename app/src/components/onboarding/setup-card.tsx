import { Button } from "@houston-ai/core";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

// Re-exported so onboarding call sites keep a single import surface
// (`import { OptionCard, SetupCard } from "../setup-card"`).
export { OptionCard } from "./option-card";

/**
 * The one frame every first-run setup screen shares, so Welcome, the agreement,
 * and each onboarding step read as a single coherent flow rather than a pile of
 * mismatched screens. Modeled on the Discord server-onboarding pattern: a
 * centered card with a small step eyebrow, one clear question, the content, and
 * a Back / helper / Next footer.
 *
 * Always a plain white card ({@link https://…|`bg-card`}) that floats on the
 * calm grey {@link FirstRunScreen} background: a hairline `border-line` and a
 * soft shadow lift it off the gutter, no glass, no backdrop-blur. The
 * FirstRunScreen wrapper pins `data-theme="light"`, so the card reads the same
 * bright light way in both app themes.
 *
 * Houston-monochrome: selection uses the near-black foreground, never a
 * decorative accent (design-system color restraint).
 */
interface SetupCardProps {
  /** Optional brand mark above the eyebrow (used by the Welcome hero). */
  icon?: ReactNode;
  /** Small muted line above the title, e.g. "Step 2 of 3" or "Welcome". */
  eyebrow?: string;
  /** Omit on screens that render their own centered hero (e.g. success). */
  title?: string;
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
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6">
      {/* Fixed height + flex-1 content so the card stays the SAME size across
          every step and the footer never jumps as content changes. Keyed by
          title so React remounts (and the CSS entrance replays) on each step
          change, but not on in-step state updates like typing. A plain white
          card with a hairline + soft shadow, floating on the grey first-run
          background — no glass, no backdrop-blur. */}
      <div
        key={title}
        className="setup-step-in relative z-10 flex h-[680px] max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-line bg-card p-8 text-ink shadow-[0_4px_24px_rgba(0,0,0,0.06)]"
      >
        {icon && <div className="mb-4">{icon}</div>}
        {eyebrow && (
          <p className="text-xs font-medium text-ink-muted">{eyebrow}</p>
        )}
        {title && (
          <h1 className="mt-1 text-[22px] font-semibold leading-tight">
            {title}
          </h1>
        )}
        {subtitle && <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>}

        <div className="mt-6 flex min-h-0 flex-1 flex-col">{children}</div>

        {(onBack || onNext || helper) && (
          <div className="mt-8 flex items-center justify-between gap-4">
            <div className="shrink-0">
              {onBack && (
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-full"
                  onClick={onBack}
                >
                  <ArrowLeft className="size-4" />
                  {backLabel}
                </Button>
              )}
            </div>
            {helper && (
              <p className="flex-1 text-right text-xs text-ink-muted">
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
