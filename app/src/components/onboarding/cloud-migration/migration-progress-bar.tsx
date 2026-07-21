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

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * A thin, elegant progress bar for the cloud-migration wizard.
 *
 * The displayed value smoothly tracks the real `fraction`, and between real
 * updates it *creeps* forward on its own so a slow phase never looks frozen —
 * but only toward a plausible ceiling (`fraction + 0.08`, hard-capped at 0.98
 * until the migration truly completes), decelerating as it approaches so it
 * never overshoots the truth. It is strictly non-decreasing: a real increase
 * snaps the floor up, the creep only ever adds. Reduced motion opts out of
 * both the animation and the creep, jumping straight to the real value.
 *
 * Visual only — no text label (the integration wave owns any surrounding copy).
 */
export function MigrationProgressBar({
  fraction,
  className,
}: {
  fraction: number;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  const target = clamp01(fraction);
  const [displayed, setDisplayed] = useState(target);
  // Latest real target, read inside the interval without re-subscribing it.
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (reduce) {
      setDisplayed(target);
      return;
    }
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
  }, [reduce, target]);

  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-chip ${className ?? ""}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Number(target.toFixed(2))}
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
