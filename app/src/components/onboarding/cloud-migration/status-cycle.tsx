import { useEffect, useState } from "react";

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
 * The progress screen's cycling status line: fades between phase phrases
 * every ~2.6s so a long wait still shows movement second to second (the same
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
      className="min-h-[1.25em] text-sm text-ink-muted transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {phrases[index]}
    </p>
  );
}
