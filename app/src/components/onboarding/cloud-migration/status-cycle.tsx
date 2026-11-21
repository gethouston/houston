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
