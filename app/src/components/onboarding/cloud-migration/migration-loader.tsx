import { HoustonHelmet } from "@houston-ai/core";
import { useEffect, useState } from "react";

const RING_STYLE = {
  background:
    "conic-gradient(from 0deg, #3b82f6, #818cf8, #e8863c, #f0c000, #3b82f6)",
  WebkitMask:
    "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3.5px))",
  mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3.5px))",
} as const;

const GLOW_STYLE = {
  background:
    "radial-gradient(closest-side, color-mix(in srgb, #818cf8 42%, transparent), transparent)",
} as const;

/**
 * The migration wizard's wait-screen loader (HOU-719): the running-glow
 * rainbow ring spinning around the Houston helmet, with a soft breathing
 * glow behind it and a gentle helmet scale-pulse. All motion lives in the
 * `.migration-*` classes in `styles/futuristic.css`, which collapse to
 * fully static under `prefers-reduced-motion`.
 */
export function MigrationLoader() {
  return (
    <div className="relative grid size-32 place-items-center" aria-hidden>
      <span
        className="migration-glow absolute inset-[14%] -z-10 rounded-full opacity-50 blur-xl dark:opacity-90"
        style={GLOW_STYLE}
      />
      <span
        className="migration-ring absolute inset-0 rounded-full"
        style={RING_STYLE}
      />
      <span className="migration-helmet grid place-items-center">
        <HoustonHelmet
          size={52}
          color="currentColor"
          className="text-foreground"
        />
      </span>
    </div>
  );
}

const CYCLE_MS = 2600;
const FADE_MS = 400;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The loader's cycling status line: fades between phase phrases every
 * ~2.6s so a long wait still shows movement second to second (the same
 * "AI working, never a dead screen" principle as everywhere else in the
 * app). Reduced-motion shows the first phrase only, no cycling.
 */
export function MigrationStatusCycle({ phrases }: { phrases: string[] }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (prefersReducedMotion() || phrases.length <= 1) return;
    let fadeTimeout: ReturnType<typeof setTimeout>;
    const interval = setInterval(() => {
      setVisible(false);
      fadeTimeout = setTimeout(() => {
        setIndex((i) => (i + 1) % phrases.length);
        setVisible(true);
      }, FADE_MS);
    }, CYCLE_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(fadeTimeout);
    };
  }, [phrases.length]);

  return (
    <p
      className="min-h-[1.25em] text-sm text-muted-foreground transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {phrases[index]}
    </p>
  );
}
