import { Button, cn } from "@houston-ai/core";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

// On the space backdrop the card is the landing page's near-opaque bluish
// glass (`--ht-space-glass`), not the futuristic aurora glass the dark tokens
// are tuned for — so `secondary` (5% white) and `accent` (8%) read as nearly
// invisible fills on it. We re-point the underlying `--ht-*` custom properties
// (which every `--color-*` Tailwind utility aliases) at the theme-invariant
// `--ht-space-card-*` token set, scoped to just this card and its descendants.
// Inline style so it always wins over the pinned `[data-theme="dark"]` token
// block; it never leaks past the onSpace card. Buttons here read as clickable
// through FILL contrast alone (secondary/accent) — no border is boosted: the
// card itself and every button inside it are deliberately borderless.
// Exported for the other dark-pinned on-space surfaces (the cloud-migration
// wizard's hero frame) so the remap stays defined exactly once.
export const SPACE_CARD_VARS: CSSProperties = {
  "--ht-chip": "var(--ht-space-card-secondary)",
  "--ht-chip-text": "var(--ht-space-card-secondary-fg)",
  "--ht-hover": "var(--ht-space-card-accent)",
} as CSSProperties;

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
 * `onSpace` floats the card inside the shared `SpaceScreen` space backdrop used by
 * onboarding: it drops the standalone `h-screen`/`bg-chip` backdrop (the
 * SpaceScreen supplies both) and pins the card to the dark palette so it reads
 * identically in both app themes, exactly like the sign-in card. Left false for
 * the standalone gates (language, disclaimer), which keep the dimmed backdrop.
 *
 * Houston-monochrome, not Discord-blue: selection uses the near-black
 * foreground, never a decorative accent (design-system color restraint).
 */
interface SetupCardProps {
  /** Float the card on the shared SpaceScreen backdrop (pins the dark palette). */
  onSpace?: boolean;
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
  onSpace = false,
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
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden px-6",
        onSpace ? "flex-1" : "h-screen bg-chip/60 text-ink",
      )}
    >
      {/* Fixed min height + flex-1 content so the card stays the SAME size
          across every step and the footer never jumps as content changes.
          Keyed by title so React remounts (and the CSS entrance replays) on
          each step change, but not on in-step state updates like typing.
          On the space backdrop the card pins the dark palette (data-theme)
          and wears the LANDING PAGE's glass (`--ht-space-glass` translucent
          bluish surface + hairline + blur), so the app's pre-workspace cards
          and the marketing site's cards read as one material. Off-space stays
          the borderless solid card. */}
      <div
        key={title}
        data-theme={onSpace ? "dark" : undefined}
        style={onSpace ? SPACE_CARD_VARS : undefined}
        className={cn(
          "setup-step-in relative z-10 flex h-[680px] max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl p-8",
          onSpace
            ? "border border-[var(--ht-space-glass-border)] bg-[var(--ht-space-glass)] text-ink shadow-2xl backdrop-blur-md"
            : "bg-input shadow-[0_4px_24px_rgba(0,0,0,0.06)]",
        )}
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
