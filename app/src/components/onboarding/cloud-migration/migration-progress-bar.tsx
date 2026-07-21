import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** How often the fake-forward creep re-evaluates (ms). */
const CREEP_MS = 120;
/** Fraction of the remaining gap the bar closes each creep tick (eased). */
const CREEP_RATE = 0.03;
/** The bar creeps at most this far past the last real fraction… */
const CREEP_LEAD = 0.08;
/** …and never past this hard ceiling until the real value reaches 1. */
const CREEP_CAP = 0.98;

/** Ceiling the time-based indeterminate creep asymptotes toward but never
 *  reaches — it must never look "done" while the phase is still open. */
const INDETERMINATE_CEIL = 0.9;
/** Time constant τ of the indeterminate creep `CEIL·(1 − e^(−t/τ))`, tuned so
 *  ~60s reads ~0.70 (0.9·(1 − e^(−1.5)) ≈ 0.70) — fast at first, then slowing,
 *  inching toward 0.9 forever without ever completing on its own. */
const INDETERMINATE_TAU_MS = 40_000;
/** Static fill shown for the indeterminate phase under reduced motion (no
 *  creep, no animation) — a calm "in progress" placeholder. */
const INDETERMINATE_STATIC = 0.5;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Elapsed-time value of the indeterminate creep (see the constants above). */
function indeterminateValue(elapsedMs: number): number {
  return INDETERMINATE_CEIL * (1 - Math.exp(-elapsedMs / INDETERMINATE_TAU_MS));
}

/**
 * A thin, elegant progress bar for the cloud-migration wizard.
 *
 * **Real mode** (`fraction` is a number): the displayed value smoothly tracks
 * the real fraction, and between real updates it *creeps* forward on its own so
 * a slow phase never looks frozen — but only toward a plausible ceiling
 * (`fraction + 0.08`, hard-capped at 0.98 until the migration truly completes),
 * decelerating as it approaches so it never overshoots the truth.
 *
 * **Indeterminate mode** (`fraction === null`): the backup / prepare phases
 * have no measurable fraction, so the bar advances purely on elapsed time
 * toward a ceiling it never reaches (`0.9·(1 − e^(−t/τ))`) — fast at first, then
 * slowing — signalling "working" without ever claiming completion.
 *
 * It is strictly non-decreasing across both modes and across the transition
 * between them: the displayed value is a persisted floor the creep only ever
 * adds to, so when the phase flips from indeterminate to a real per-task
 * fraction the bar continues smoothly from wherever it was (a real value below
 * the current fill is floored up, never a jump down). Reduced motion opts out
 * of all motion: real mode jumps to the real value, indeterminate mode holds a
 * static mid-fill — both still floored so they never move backward.
 *
 * Visual only — no text label (the integration wave owns any surrounding copy).
 */
export function MigrationProgressBar({
  fraction,
  className,
}: {
  fraction: number | null;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  const indeterminate = fraction === null;
  const target = indeterminate ? 0 : clamp01(fraction);
  const [displayed, setDisplayed] = useState(() =>
    indeterminate ? (reduce ? INDETERMINATE_STATIC : 0) : target,
  );
  // Latest real target, read inside the interval without re-subscribing it.
  const targetRef = useRef(target);
  targetRef.current = target;
  // Wall-clock origin of the indeterminate creep, captured on its first tick
  // and held for the whole indeterminate phase so the curve is continuous.
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) {
      // No motion: jump to a static placeholder (indeterminate) or the real
      // value — but never below what's already shown.
      setDisplayed((d) =>
        Math.max(d, indeterminate ? INDETERMINATE_STATIC : target),
      );
      return;
    }
    if (indeterminate) {
      if (startRef.current === null) startRef.current = Date.now();
      const timer = setInterval(() => {
        setDisplayed((d) => {
          const elapsed = Date.now() - (startRef.current ?? Date.now());
          return Math.max(d, indeterminateValue(elapsed));
        });
      }, CREEP_MS);
      return () => clearInterval(timer);
    }
    // Real phase: retire the indeterminate origin. The displayed floor carries
    // over untouched, so the bar continues from where the creep left it.
    startRef.current = null;
    // On a real increase, never animate below the truth — pull the floor up.
    setDisplayed((d) => Math.max(d, target));
    const timer = setInterval(() => {
      setDisplayed((d) => {
        const real = targetRef.current;
        const ceiling = real >= 1 ? 1 : Math.min(real + CREEP_LEAD, CREEP_CAP);
        const floor = Math.max(d, real);
        if (floor >= ceiling) return floor;
        // Ease toward the ceiling; stop cleanly once effectively there.
        const next = floor + (ceiling - floor) * CREEP_RATE;
        return next > ceiling - 0.0005 ? ceiling : next;
      });
    }, CREEP_MS);
    return () => clearInterval(timer);
  }, [reduce, indeterminate, target]);

  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-chip ${className ?? ""}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={1}
      // Omit aria-valuenow while indeterminate — the ARIA signal for "unknown".
      aria-valuenow={indeterminate ? undefined : Number(target.toFixed(2))}
    >
      <div
        className="h-full rounded-full bg-action"
        style={{
          width: `${clamp01(displayed) * 100}%`,
          transition: reduce ? "none" : "width 200ms ease-out",
        }}
      />
    </div>
  );
}
