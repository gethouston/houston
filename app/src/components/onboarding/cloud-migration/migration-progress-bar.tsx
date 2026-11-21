import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const CREEP_MS = 120;
const CREEP_RATE = 0.03;
const CREEP_LEAD = 0.08;
const CREEP_CAP = 0.98;

const INDETERMINATE_CEIL = 0.9;
const INDETERMINATE_TAU_MS = 40_000;
const INDETERMINATE_STATIC = 0.5;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function indeterminateValue(elapsedMs: number): number {
  return INDETERMINATE_CEIL * (1 - Math.exp(-elapsedMs / INDETERMINATE_TAU_MS));
}

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
  const targetRef = useRef(target);
  targetRef.current = target;
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) {
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
    startRef.current = null;
    setDisplayed((d) => Math.max(d, target));
    const timer = setInterval(() => {
      setDisplayed((d) => {
        const real = targetRef.current;
        const ceiling = real >= 1 ? 1 : Math.min(real + CREEP_LEAD, CREEP_CAP);
        const floor = Math.max(d, real);
        if (floor >= ceiling) return floor;
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
